package com.ugr.sanbot_app;

import android.os.Bundle;
import android.os.Handler;
import android.util.Log;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;


import com.qihancloud.opensdk.base.BindBaseActivity;
import com.qihancloud.opensdk.base.TopBaseActivity;
import com.qihancloud.opensdk.beans.FuncConstant;
import com.qihancloud.opensdk.function.beans.SpeakOption;
import com.qihancloud.opensdk.function.beans.speech.Grammar;
import com.qihancloud.opensdk.function.unit.SpeechManager;
import com.qihancloud.opensdk.function.unit.WheelMotionManager;
import com.qihancloud.opensdk.function.unit.interfaces.speech.RecognizeListener;
import com.qihancloud.opensdk.function.unit.interfaces.speech.WakenListener;
import com.qihancloud.opensdk.function.unit.HardWareManager;
import com.qihancloud.opensdk.function.unit.HeadMotionManager;
import com.qihancloud.opensdk.function.unit.HandMotionManager;


import java.net.URI;


public class MainActivity extends BindBaseActivity {
    Button botonHablar;

    Button botonSaludo;
    TextView tvResultadoSTT;
    SpeakOption speakOption;
    SpeechManager speechManager;
    HardWareManager hardWareManager;
    HeadMotionManager headMotionManager;
    HandMotionManager handMotionManager;

    String TAG = "Mi_APP"; //Etiqueta para filtrar en el log solo mis mensajes -> filtro: tag:Mi_APP

    SpeechHelper speechHelper;
    HeadHelper headHelper;
    HandHelper handHelper;

    RobotWebSocketClient webSocketClient;




    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setContentView(R.layout.activity_main);

        botonHablar = findViewById(R.id.boton_hablar);
        botonSaludo =findViewById(R.id.boton_saludo);

        tvResultadoSTT = findViewById(R.id.textView_resultado_stt);


    }

    //Esta función se ejecuta al cargar el SDK del robot -> las llamadas al SDK tienen que ir en esta función
    @Override
    protected void onMainServiceConnected() {
        //Evita que la aplicación se suspenda al usar el robot
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        speechManager = (SpeechManager)getUnitManager(FuncConstant.SPEECH_MANAGER);
        WheelMotionManager wheelMotionManager= (WheelMotionManager)getUnitManager(FuncConstant.WHEELMOTION_MANAGER);
        hardWareManager = (HardWareManager)getUnitManager(FuncConstant.HARDWARE_MANAGER);
        headMotionManager = (HeadMotionManager) getUnitManager(FuncConstant.HEADMOTION_MANAGER);
        handMotionManager = (HandMotionManager) getUnitManager(FuncConstant.HANDMOTION_MANAGER);



        hardWareManager = (HardWareManager)getUnitManager(FuncConstant.HARDWARE_MANAGER);
        speechHelper = new SpeechHelper(speechManager);
        headHelper = new HeadHelper(headMotionManager, speechHelper);
        handHelper = new HandHelper(handMotionManager, speechHelper);

        speakOption = new SpeakOption();
        speakOption.setSpeed(40);

        botonHablar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                speechManager.startSpeak("Di algo", speakOption);

                speechManager.doWakeUp();
            }
        });

        speechManager.setOnSpeechListener(new RecognizeListener() {
            @Override
            public boolean onRecognizeResult(Grammar grammar) {
                tvResultadoSTT.setText("Resultado STT: " + grammar.getText());
                Log.d(TAG, "El robot ha escuchado: " + grammar.getText());
                return true;
            }

            @Override
            public void onRecognizeVolume(int i) {

            }
        });

        speechManager.setOnSpeechListener(new WakenListener() {
            @Override
            public void onWakeUp() {
                Log.d(TAG, "El robot ha empezado a escuchar.");
            }
            @Override
            public void onSleep() {
                Log.d(TAG, "El robot ha dejado de escuchar.");
            }
        });

        // Saludar
        botonSaludo.setOnClickListener(v -> handHelper.saludarNatural());


        try {
            URI uri = new URI("ws://192.168.1.51:8000/ws/robot"); // IP de tu PC
            webSocketClient = new RobotWebSocketClient(uri, message -> {
                runOnUiThread(() -> {
                    speechManager.startSpeak(message, speakOption);
                    Log.d(TAG, "Orden speak recibida: " + message);
                });
            });


            webSocketClient.connect();

        } catch (Exception e) {
            e.printStackTrace();
        }

    }
}