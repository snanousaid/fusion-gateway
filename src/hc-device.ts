import { DigiforgeClient } from "./digiforge";

export function handleHCplusPayload(transmitter: DigiforgeClient, message: Buffer) {
    const payload = JSON.parse(message.toString());
    const msg = {
        device_info: payload
    }
    console.log("Transmitting DeviceInfo");
    transmitter.transmit(JSON.stringify(msg));
}

export function handleAgentPayload(transmitter: DigiforgeClient, message: any) {
    console.log("Transmitting AgentData");
    transmitter.transmit(JSON.stringify(message));
}