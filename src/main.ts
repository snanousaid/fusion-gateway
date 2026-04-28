import { DigiforgeClient } from "./digiforge";
import { connect as CreateMqttConnection } from "mqtt";
import { handleShellyMessage } from "./shelly";
import { openSerial } from "./serial";
import { env } from "./env";


const ALERT_INTERVAL = 60 * 1000;
type DeviceTypes = 'shellies' | 'sensors';
interface LastReceivedTimes {
    shellies: { [id: string]: number };
    sensors: { [id: string]: number };
}

async function main() {
    const transmitter = new DigiforgeClient({
        clientId: env.DIGIFORGE_CLIENTID,
        username: env.DIGIFORGE_USERNAME,
        password: env.DIGIFORGE_PASSWORD,
        pub_topic: "nxt/devices/" + env.DIGIFORGE_CLIENTID + "/data",
        sub_topic: "nxt/devices/" + env.DIGIFORGE_CLIENTID + "/rpc",
    });

    let connected = await transmitter.connect();
    while (!connected) {
        console.log("Retrying connection in 10 seconds...");
        await new Promise(res => setTimeout(res, 10000));
        connected = await transmitter.connect();
    }
    const msg = {
        ver: "0.8.1"
    }


    transmitter.transmit(JSON.stringify(msg));

    const localClient = CreateMqttConnection(env.MQTT_BROKER, {
        clientId: "digiforge_service",
    });

    const lastReceivedTimes: LastReceivedTimes = {
        shellies: {},
        sensors: {}
    };


    function updateLastReceivedTime(type: DeviceTypes, id: string) {
        lastReceivedTimes[type][id] = Date.now();
    }


    localClient.on("connect", () => {
        localClient.subscribe("shellies/#");
    });

    localClient.on("message", (topic, message) => {
        const segments = topic.split("/");
        if (segments[0] === "shellies") {
            handleShellyMessage(transmitter, topic, message);
            updateLastReceivedTime('shellies', segments[1] || 'shellies');
        }
    });

    openSerial(
        transmitter,
        env.SERIAL_PORT,
        env.SERIAL_BAUDRATE,
        env.SENSOR_ID,
        () => updateLastReceivedTime('sensors', `sensor-${env.SENSOR_ID}`)
    );


    function checkForAlerts() {
        const now = Date.now();
        const alerts: { [id: string]: { status: boolean, alert: string, timestamp: number } } = {};
        Object.keys(lastReceivedTimes).forEach((type) => {
            const deviceType = type as DeviceTypes;
            Object.keys(lastReceivedTimes[deviceType]).forEach(id => {
                const lastReceivedTime = lastReceivedTimes[deviceType][id];
                if (now - lastReceivedTime > ALERT_INTERVAL) {
                    alerts[id] = {
                        status: false,
                        alert: `${id} not connected`,
                        timestamp: now
                    };
                } else {
                    alerts[id] = {
                        status: true,
                        alert: `${id} is connected`,
                        timestamp: now
                    };
                }
            });
        });
        const msg = {
            alerts: alerts
        }

        transmitter.transmit(JSON.stringify(msg));
        console.log("Transmitting alerts");
    }

    // Check for alerts every minute
    setInterval(checkForAlerts, 60 * 1000);

}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
