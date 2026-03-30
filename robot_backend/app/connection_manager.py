"""
ConnectionManager — registro y enrutamiento de conexiones WebSocket.

Roles de cliente
────────────────
  ClientRole.WIZARD  → Interfaz del operador (React frontend).
                       Recibe: robot_speech, delivered, status.
                       NO recibe: wizard_message (ya lo pintó optimistamente).

  ClientRole.ROBOT   → App Android del Sanbot Elf.
                       Recibe: wizard_message, status.
                       NO recibe: robot_speech ni delivered.

La distinción de rol se hace mediante el path de conexión WS:
  /ws/wizard  → rol WIZARD
  /ws/robot   → rol ROBOT
"""

import json
import logging
from enum import StrEnum
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ClientRole(StrEnum):
    WIZARD = "wizard"
    ROBOT  = "robot"


class ConnectedClient:
    """Wrapper que asocia un WebSocket con su rol."""

    def __init__(self, websocket: WebSocket, role: ClientRole):
        self.websocket = websocket
        self.role      = role

    async def send(self, payload: dict[str, Any]) -> None:
        """Envía un dict serializado como JSON. Registra errores sin propagar."""
        try:
            await self.websocket.send_text(json.dumps(payload))
        except Exception as exc:
            logger.warning("Error al enviar a cliente %s: %s", self.role, exc)
            raise  # el caller decide si desconectar


class ConnectionManager:
    """
    Gestiona el ciclo de vida de las conexiones WebSocket y
    el enrutamiento de mensajes según el rol de cada cliente.
    """

    def __init__(self) -> None:
        self._clients: list[ConnectedClient] = []

    # ── Lifecycle ────────────────────────────────────────────────

    async def connect(self, websocket: WebSocket, role: ClientRole) -> ConnectedClient:
        await websocket.accept()
        client = ConnectedClient(websocket, role)
        self._clients.append(client)
        logger.info("Cliente conectado [%s]. Total: %d", role, len(self._clients))
        return client

    def disconnect(self, client: ConnectedClient) -> None:
        self._clients.remove(client)
        logger.info("Cliente desconectado [%s]. Total: %d", client.role, len(self._clients))

    # ── Queries ──────────────────────────────────────────────────

    def clients_with_role(self, role: ClientRole) -> list[ConnectedClient]:
        return [c for c in self._clients if c.role == role]

    @property
    def robot_connected(self) -> bool:
        return bool(self.clients_with_role(ClientRole.ROBOT))

    # ── Broadcast helpers ────────────────────────────────────────

    async def send_to_role(self, role: ClientRole, payload: dict[str, Any]) -> None:
        """Envía un payload a todos los clientes de un rol dado."""
        failed: list[ConnectedClient] = []

        for client in self.clients_with_role(role):
            try:
                await client.send(payload)
            except Exception:
                failed.append(client)

        for client in failed:
            self.disconnect(client)

    async def send_to_client(self, client: ConnectedClient, payload: dict[str, Any]) -> None:
        """Envía un payload a un cliente específico."""
        try:
            await client.send(payload)
        except Exception:
            self.disconnect(client)

    async def broadcast(self, payload: dict[str, Any]) -> None:
        """Envía un payload a TODOS los clientes conectados."""
        await self.send_to_role(ClientRole.WIZARD, payload)
        await self.send_to_role(ClientRole.ROBOT,  payload)


# Instancia global — importar desde aquí
manager = ConnectionManager()