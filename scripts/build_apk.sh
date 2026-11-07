#!/data/data/com.termux/files/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIR="$PROJECT_ROOT/web"
ANDROID_DIR="$WEB_DIR/android"

echo "======================================================================"
echo " ZhViSub — Script đóng gói APK Android (Capacitor)"
echo "======================================================================"

# 1. Check requirements
echo "1. Kiểm tra môi trường..."
if ! command -v node >/dev/null 2>&1; then
    echo "❌ Lỗi: Chưa cài đặt Node.js."
    exit 1
fi
echo "   Node.js: $(node -v)"

if ! command -v java >/dev/null 2>&1; then
    echo "❌ Lỗi: Chưa cài đặt JDK (yêu cầu JDK 17 hoặc 21)."
    exit 1
fi
echo "   Java: $(java -version 2>&1 | head -n 1)"

if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
    echo "⚠️ Cảnh báo: Biến ANDROID_HOME hoặc ANDROID_SDK_ROOT chưa được thiết lập."
    echo "   Nếu chạy trong Android Studio hoặc trên máy tính dev đã có SDK,"
    echo "   hãy export ANDROID_HOME=/path/to/android-sdk trước khi chạy gradlew."
fi

# 2. Build Next.js static export
echo "----------------------------------------------------------------------"
echo "2. Build Next.js static export (web/out)..."
cd "$WEB_DIR"
npm run build

# 3. Capacitor sync
echo "----------------------------------------------------------------------"
echo "3. Đồng bộ Capacitor assets vào Android project..."
node ./node_modules/@capacitor/cli/bin/capacitor sync android

# 4. Build APK with Gradle
echo "----------------------------------------------------------------------"
MODE="${1:-debug}"

if [ "$MODE" = "release" ]; then
    echo "4. Build APK Release..."
    KEYSTORE_FILE="$ANDROID_DIR/app/zhvisub-release-key.jks"
    if [ ! -f "$KEYSTORE_FILE" ]; then
        echo "⚠️ Không tìm thấy release keystore tại: $KEYSTORE_FILE"
        echo "Lệnh tạo Keystore mẫu (chạy 1 lần):"
        echo "keytool -genkey -v -keystore $KEYSTORE_FILE -alias zhvisub -keyalg RSA -keysize 2048 -validity 10000"
        echo "Sau đó cấu hình signingConfig trong android/app/build.gradle."
        exit 1
    fi
    cd "$ANDROID_DIR"
    ./gradlew assembleRelease
    echo "✔ APK Release đã tạo tại: $ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
else
    echo "4. Build APK Debug..."
    cd "$ANDROID_DIR"
    if [ -n "$ANDROID_HOME" ] || [ -d "$HOME/Android/Sdk" ]; then
        ./gradlew assembleDebug
        echo "✔ APK Debug đã tạo tại: $ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
    else
        echo "ℹ️ Dự án Android đã được sinh và đồng bộ hoàn tất tại: $ANDROID_DIR"
        echo "   Để xuất file .apk, hãy mở thư mục '$ANDROID_DIR' bằng Android Studio"
        echo "   hoặc thiết lập ANDROID_HOME rồi chạy: cd web/android && ./gradlew assembleDebug"
    fi
fi

echo "======================================================================"
echo " Đóng gói hoàn tất!"
echo "======================================================================"
