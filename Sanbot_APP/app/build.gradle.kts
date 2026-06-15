plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.ugr.sanbot_app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.ugr.sanbot_app"
        minSdk = 21
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Forzar ABI de 32 bits que usa el SDK de Sanbot
        ndk {
            abiFilters += listOf("armeabi-v7a")
        }
    }

    // Necesario para que las .so con text relocations no causen crash
    packagingOptions {
        jniLibs {
            useLegacyPackaging = true
        }
    }

    // Flavor "legacy" para el Sanbot físico:
    //   - targetSdk = 22 desactiva la restricción de text relocations (API 23+)
    //     que impide cargar libuvcNative.so (la librería nativa de la cámara).
    //   - Incluye armeabi además de armeabi-v7a porque el .so del SDK
    //     está empaquetado bajo jni/armeabi/ dentro del AAR.
    flavorDimensions += "target"
    productFlavors {
        create("standard") {
            dimension = "target"
            // Hereda todo de defaultConfig, no sobreescribe nada.
        }
        create("legacy") {
            dimension = "target"
            targetSdk = 22
            versionNameSuffix = "-legacy"
            ndk {
                abiFilters += listOf("armeabi-v7a", "armeabi")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    buildFeatures {
        viewBinding = true
    }
}

dependencies {

    implementation(libs.appcompat)
    implementation(libs.material)
    implementation(libs.activity)
    implementation(libs.constraintlayout)
    testImplementation(libs.junit)
    androidTestImplementation(libs.ext.junit)
    androidTestImplementation(libs.espresso.core)

    implementation(files("libs/QihanOpenSDK_1.1.8.0.aar"))
    implementation(files("libs/gson-2.2.4.jar"))
    implementation("org.java-websocket:Java-WebSocket:1.5.3")

    // CameraX para acceder a la cámara estándar de Android (la que hay debajo
    // de la tablet del Sanbot). Es independiente del SDK de Qihan.
    val cameraxVersion = "1.3.4"
    implementation("androidx.camera:camera-core:$cameraxVersion")
    implementation("androidx.camera:camera-camera2:$cameraxVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraxVersion")
}

