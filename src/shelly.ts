import { DigiforgeClient } from "./digiforge";

interface ShellyDevice {
  name: string;

  phase0_reactive_power: string;
  phase1_reactive_power: string;
  phase2_reactive_power: string;

  phase0_power: string;
  phase1_power: string;
  phase2_power: string;

  phase0_voltage_power: string;
  phase1_voltage_power: string;
  phase2_voltage_power: string;

  transmitTimer: NodeJS.Timeout | null;
}

const devices: Record<string, ShellyDevice> = {};

export function handleShellyMessage(
  transmitter: DigiforgeClient,
  topic: string,
  message: Buffer
) {
  const segs = topic.split("/");
  if (segs.length < 5) return;

  const deviceName = segs[1];
  if (!devices[deviceName]) {
    devices[deviceName] = {
      name: deviceName,
      phase0_reactive_power: "0",
      phase1_reactive_power: "0",
      phase2_reactive_power: "0",
      phase0_power: "0",
      phase1_power: "0",
      phase2_power: "0",
      phase0_voltage_power: "0",
      phase1_voltage_power: "0",
      phase2_voltage_power: "0",
      transmitTimer: null,
    };
    return;
  }

  if (segs[3] === "0" && segs[4] === "reactive_power") {
    devices[deviceName].phase0_reactive_power = message.toString();
  } else if (segs[3] === "1" && segs[4] === "reactive_power") {
    devices[deviceName].phase1_reactive_power = message.toString();
  } else if (segs[3] === "2" && segs[4] === "reactive_power") {
    devices[deviceName].phase2_reactive_power = message.toString();
  } else if (segs[3] === "0" && segs[4] === "power") {
    devices[deviceName].phase0_power = message.toString();
  } else if (segs[3] === "1" && segs[4] === "power") {
    devices[deviceName].phase1_power = message.toString();
  } else if (segs[3] === "2" && segs[4] === "power") {
    devices[deviceName].phase2_power = message.toString();
  } else if (segs[3] === "0" && segs[4] === "voltage") {
    devices[deviceName].phase0_voltage_power = message.toString();
  } else if (segs[3] === "1" && segs[4] === "voltage") {
    devices[deviceName].phase1_voltage_power = message.toString();
  } else if (segs[3] === "2" && segs[4] === "voltage") {
    devices[deviceName].phase2_voltage_power = message.toString();
  }

  if (devices[deviceName]?.transmitTimer === null) {
    devices[deviceName].transmitTimer = setTimeout(() => {
      const payload = {
        power_meters: {
          [devices[deviceName].name]: {
            name: devices[deviceName].name,
            phase0_reactive_power: devices[deviceName].phase0_reactive_power,
            phase1_reactive_power: devices[deviceName].phase1_reactive_power,
            phase2_reactive_power: devices[deviceName].phase2_reactive_power,
            phase0_power: devices[deviceName].phase0_power,
            phase1_power: devices[deviceName].phase1_power,
            phase2_power: devices[deviceName].phase2_power,
            phase0_voltage_power: devices[deviceName].phase0_voltage_power,
            phase1_voltage_power: devices[deviceName].phase1_voltage_power,
            phase2_voltage_power: devices[deviceName].phase2_voltage_power,
          },
        },
      };
      console.log("Transmitting Power");
      transmitter.transmit(JSON.stringify(payload));
    }, 500);
  }

  devices[deviceName]?.transmitTimer?.refresh();
}
