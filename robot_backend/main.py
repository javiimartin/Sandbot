from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import List
from fastapi.middleware.cors import CORSMiddleware
import json
import asyncio
 

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# ===============================
# Connection Manager
# ===============================

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print("Robot conectado. Total conexiones:", len(self.active_connections))

        await websocket.send_text(json.dumps({
            "type": "status",
            "connected": True
        }))


    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        print("Robot desconectado. Total conexiones:", len(self.active_connections))

    async def send_message(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)


manager = ConnectionManager()


# ===============================
# WebSocket Endpoint
# ===============================

@app.websocket("/ws/robot")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)

    try:
        while True:
            # Mantener la conexión viva
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ===============================
# HTTP Endpoint para enviar mensaje
# ===============================

class Message(BaseModel):
    text: str


@app.post("/send")
async def send_message(message: Message):
    payload = {
        "type": "speak",
        "text": message.text
    }

    disconnected = []

    for connection in manager.active_connections:
        try:
            await connection.send_text(json.dumps(payload))
        except RuntimeError:
            disconnected.append(connection)

    for connection in disconnected:
        manager.active_connections.remove(connection)

    return {"status": "ok"}

