import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { DigiforgeClient } from "./digiforge";

const RETRY_INTERVAL_MS = 5000;

export function openSerial(
    transmitter: DigiforgeClient,
    portPath: string,
    baudRate: number,
    sensorId: string,
    onData: () => void
) {
    let wasConnected = false;
    let retryTimer: NodeJS.Timeout | null = null;

    function scheduleRetry() {
        if (retryTimer) return;
        retryTimer = setTimeout(() => {
            retryTimer = null;
            tryOpen();
        }, RETRY_INTERVAL_MS);
    }

    function tryOpen() {
        const port = new SerialPort({ path: portPath, baudRate, autoOpen: false });
        const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

        port.on("open", () => {
            if (!wasConnected) {
                console.log(`Serial port ${portPath} open @ ${baudRate}`);
                wasConnected = true;
            }
        });

        port.on("close", () => {
            if (wasConnected) {
                console.log(`Serial port ${portPath} disconnected`);
                wasConnected = false;
            }
            scheduleRetry();
        });

        port.on("error", () => {
            // silencieux pour ne pas spammer; le changement d'état est logué via close/open
            scheduleRetry();
        });

        parser.on("data", (line: string) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            try {
                const payload = JSON.parse(trimmed);
                console.log('data', payload)
                const data = {
                    [`sensor-${sensorId}`]: payload,
                };
                console.log("Transmitting Sensors");
                transmitter.transmit(JSON.stringify(data));
                onData();
            } catch (e) {
                console.error("Invalid serial JSON:", trimmed);
            }
        });

        port.open((err) => {
            if (err) {
                scheduleRetry();
            }
        });
    }

    tryOpen();
}
