import { DigiforgeClient } from "./digiforge";
import { connect as CreateMqttConnection } from "mqtt";
import { handleShellyMessage } from "./shelly";
import { handleAgentPayload, handleHCplusPayload } from "./hc-device";
import { env } from "./env";


const ALERT_INTERVAL = 60 * 1000;
type DeviceTypes = 'shellies' | 'HCplus' | 'agents' | 'sensors';
interface LastReceivedTimes {
    shellies: { [id: string]: number };
    HCplus: { [id: string]: number };
    agents: { [id: string]: number };
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

    await transmitter.connect();

    if (!transmitter.is_connected) {
        console.log("Failed to connect to Digiforge");
        process.exit(-1);
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
        HCplus: {},
        agents: {},
        sensors: {}
    };


    // Function to update the last received time
    function updateLastReceivedTime(type: DeviceTypes, id: string) {
        lastReceivedTimes[type][id] = Date.now();
    }


    localClient.on("connect", () => {
        localClient.subscribe("nxt/#");
        localClient.subscribe("shellies/#");
    });

    localClient.on("message", (topic, message) => {
        const segments = topic.split("/");
        if (segments[0] === "shellies") {
            handleShellyMessage(transmitter, topic, message);
            updateLastReceivedTime('shellies', segments[0]);
        } else if (segments[0] === "nxt") {
            if (segments[2] === "HCplus") {
                handleHCplusPayload(transmitter, message);
                updateLastReceivedTime('HCplus', segments[2]);
            } else if (segments[2] === "agent") {
                const payload = JSON.parse(message.toString());
                const agentId = segments[3];
                const data = {
                    [`box-${agentId}`]: payload
                };
                handleAgentPayload(transmitter, data);
                updateLastReceivedTime('agents', `box-${agentId}`);
            } else if (segments[2] === "sensors" && segments[4] === "data") {
                const deviceId = segments[3];
                const payload = JSON.parse(message.toString());
                console.log("deviceId", deviceId)
                console.log("payload", payload)
                const data = {
                    [`sensor-${deviceId}`]: payload,
                }
                console.log("Transmitting Sensors");
                transmitter.transmit(JSON.stringify(data));
                updateLastReceivedTime(segments[2], `sensor-${deviceId}`);
            }
        }
    });


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

main();