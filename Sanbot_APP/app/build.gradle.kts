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


}

