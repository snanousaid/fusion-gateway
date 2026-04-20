import "dotenv/config";

export const env = {
    DIGIFORGE_USERNAME: process.env.DIGIFORGE_USERNAME || "",
    DIGIFORGE_PASSWORD: process.env.DIGIFORGE_PASSWORD || "",
    DIGIFORGE_CLIENTID: process.env.DIGIFORGE_CLIENTID || "",
    MQTT_BROKER: process.env.MQTT_BROKER || "",
    SERIAL_PORT: process.env.SERIAL_PORT || "",
    SERIAL_BAUDRATE: Number(process.env.SERIAL_BAUDRATE) || 115200,
    SENSOR_ID: process.env.SENSOR_ID || process.env.DIGIFORGE_CLIENTID || "",
}
