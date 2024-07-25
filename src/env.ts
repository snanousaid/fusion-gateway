import "dotenv/config";

export const env = {
    DIGIFORGE_USERNAME: process.env.DIGIFORGE_USERNAME || "",
    DIGIFORGE_PASSWORD: process.env.DIGIFORGE_PASSWORD || "",
    DIGIFORGE_CLIENTID: process.env.DIGIFORGE_CLIENTID || "",
    MQTT_BROKER: process.env.MQTT_BROKER || "",
}