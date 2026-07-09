import * as os from "os";
import { readFile, readdir, statfs } from "fs/promises";
import { DigiforgeClient } from "./digiforge";

const CPU_SAMPLE_MS = 200;
const DISK_PATH = process.platform === "win32" ? process.cwd() : "/";

const HWMON_DIR = "/sys/class/hwmon";
const THERMAL_DIR = "/sys/class/thermal";
const CPU_CHIPS = ["coretemp", "k10temp", "zenpower"];
const PACKAGE_LABELS = ["Package id 0", "Tdie", "Tctl"];

const THRESHOLDS = {
    cpu: { warning: 70, critical: 90 },
    memory: { warning: 80, critical: 90 },
    disk: { warning: 85, critical: 95 },
    temperature: { warning: 75, critical: 85 },
};

const SEVERITY = { healthy: 0, warning: 1, critical: 2 } as const;

const BYTES_PER_GB = 1024 ** 3;

const round2 = (value: number) => Math.round(value * 100) / 100;
const toGb = (bytes: number) => round2(bytes / BYTES_PER_GB);

export type HealthStatus = keyof typeof SEVERITY;

export interface HealthCheck {
    name: string;
    status: HealthStatus;
    value: string;
}

export interface SystemHealth {
    status: HealthStatus;
    checks: HealthCheck[];
}

// Tailles en Go, pourcentages et températures arrondis à 2 décimales.
export interface Storage {
    total: number;
    used: number;
    free: number;
    percentage: number;
}

export interface SystemInfo {
    cpu: {
        usage: number;
        cores: number;
        // null quand le noyau n'expose aucun capteur (toujours le cas sous Windows).
        temperature: number | null;
    };
    memory: Storage;
    disk: Storage;
    network: {
        isConnected: boolean;
        ip: string;
        interface: string;
    };
    uptime: number;
    timestamp: string;
}

interface CpuTotals {
    idle: number;
    total: number;
}

let lastCpu: CpuTotals | null = null;

function readCpuTotals(): CpuTotals {
    let idle = 0;
    let total = 0;
    for (const cpu of os.cpus()) {
        for (const type of Object.keys(cpu.times) as (keyof os.CpuInfo["times"])[]) {
            total += cpu.times[type];
        }
        idle += cpu.times.idle;
    }
    return { idle, total };
}

// Renvoie l'utilisation moyenne depuis le dernier appel, pas une valeur instantanée.
async function getCpuUsage(): Promise<number> {
    if (!lastCpu) {
        lastCpu = readCpuTotals();
        await new Promise((res) => setTimeout(res, CPU_SAMPLE_MS));
    }

    const now = readCpuTotals();
    const idleDelta = now.idle - lastCpu.idle;
    const totalDelta = now.total - lastCpu.total;
    lastCpu = now;

    if (totalDelta <= 0) return 0;
    return round2(Math.max(0, Math.min(100, 100 - (100 * idleDelta) / totalDelta)));
}

// undefined = pas encore cherché, null = aucun capteur sur cette machine.
let tempSensorPath: string | null | undefined;

async function readTrimmed(path: string): Promise<string> {
    return (await readFile(path, "utf8")).trim();
}

// coretemp (Intel) et k10temp (AMD) exposent le capteur du package, le plus représentatif.
async function findHwmonSensor(): Promise<string | null> {
    for (const dir of await readdir(HWMON_DIR)) {
        const chipDir = `${HWMON_DIR}/${dir}`;
        try {
            if (!CPU_CHIPS.includes(await readTrimmed(`${chipDir}/name`))) continue;

            const entries = await readdir(chipDir);
            for (const entry of entries.filter((e) => /^temp\d+_label$/.test(e))) {
                if (PACKAGE_LABELS.includes(await readTrimmed(`${chipDir}/${entry}`))) {
                    return `${chipDir}/${entry.replace("_label", "_input")}`;
                }
            }
            if (entries.includes("temp1_input")) return `${chipDir}/temp1_input`;
        } catch {
            continue;
        }
    }
    return null;
}

async function findThermalZone(): Promise<string | null> {
    const byType: Record<string, string> = {};
    for (const zone of await readdir(THERMAL_DIR)) {
        if (!zone.startsWith("thermal_zone")) continue;
        try {
            byType[await readTrimmed(`${THERMAL_DIR}/${zone}/type`)] = `${THERMAL_DIR}/${zone}/temp`;
        } catch {
            continue;
        }
    }
    return byType["x86_pkg_temp"] ?? byType["acpitz"] ?? null;
}

async function findTempSensor(): Promise<string | null> {
    if (process.platform !== "linux") return null;
    try {
        return (await findHwmonSensor()) ?? (await findThermalZone());
    } catch {
        return null;
    }
}

async function getCpuTemperature(): Promise<number | null> {
    if (tempSensorPath === undefined) {
        tempSensorPath = await findTempSensor();
        if (tempSensorPath) console.log(`Capteur de température CPU: ${tempSensorPath}`);
    }
    if (!tempSensorPath) return null;

    try {
        const celsius = Number(await readTrimmed(tempSensorPath)) / 1000;
        // Un capteur qui déraille renvoie 0 ou des valeurs absurdes; mieux vaut rien que faux.
        return celsius > 0 && celsius < 150 ? round2(celsius) : null;
    } catch (err) {
        console.error(`Lecture de ${tempSensorPath} impossible:`, err);
        return null;
    }
}

// Le pourcentage vient des octets bruts: l'arrondi en Go le fausserait sur les petits volumes.
function toStorage(total: number, used: number, free: number, capacity: number): Storage {
    return {
        total: toGb(total),
        used: toGb(used),
        free: toGb(free),
        percentage: capacity > 0 ? round2((used / capacity) * 100) : 0,
    };
}

function getMemoryInfo(): Storage {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return toStorage(total, used, free, total);
}

async function getDiskInfo(): Promise<Storage> {
    try {
        const stats = await statfs(DISK_PATH);
        const total = stats.blocks * stats.bsize;
        // bavail = espace utilisable sans privilèges root, bfree l'inclut. df utilise les deux.
        const free = stats.bavail * stats.bsize;
        const used = (stats.blocks - stats.bfree) * stats.bsize;
        return toStorage(total, used, free, used + free);
    } catch (err) {
        console.error(`Impossible de lire le disque ${DISK_PATH}:`, err);
        return { total: 0, used: 0, free: 0, percentage: 0 };
    }
}

function getNetworkInfo() {
    for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
        for (const addr of addresses ?? []) {
            if (addr.family === "IPv4" && !addr.internal) {
                return { isConnected: true, ip: addr.address, interface: name };
            }
        }
    }
    return { isConnected: false, ip: "N/A", interface: "N/A" };
}

export async function getSystemInfo(): Promise<SystemInfo> {
    const [usage, disk, temperature] = await Promise.all([getCpuUsage(), getDiskInfo(), getCpuTemperature()]);

    return {
        cpu: {
            usage,
            cores: os.cpus().length,
            temperature,
        },
        memory: getMemoryInfo(),
        disk,
        network: getNetworkInfo(),
        uptime: Math.round(os.uptime()),
        timestamp: new Date().toISOString(),
    };
}

function grade(percentage: number, limits: { warning: number; critical: number }): HealthStatus {
    if (percentage > limits.critical) return "critical";
    if (percentage > limits.warning) return "warning";
    return "healthy";
}

export function getSystemHealth(info: SystemInfo): SystemHealth {
    const checks: HealthCheck[] = [
        { name: "CPU", status: grade(info.cpu.usage, THRESHOLDS.cpu), value: `${info.cpu.usage.toFixed(1)}%` },
        { name: "Memory", status: grade(info.memory.percentage, THRESHOLDS.memory), value: `${info.memory.percentage.toFixed(1)}%` },
        { name: "Disk", status: grade(info.disk.percentage, THRESHOLDS.disk), value: `${info.disk.percentage.toFixed(1)}%` },
        {
            name: "Network",
            status: info.network.isConnected ? "healthy" : "critical",
            value: info.network.isConnected ? "Connected" : "Disconnected",
        },
    ];

    // Sans capteur, aucun check: un "healthy" inventé fausserait le statut global.
    if (info.cpu.temperature !== null) {
        checks.push({
            name: "Temperature",
            status: grade(info.cpu.temperature, THRESHOLDS.temperature),
            value: `${info.cpu.temperature.toFixed(1)}°C`,
        });
    }

    const status = checks.reduce<HealthStatus>(
        (worst, check) => (SEVERITY[check.status] > SEVERITY[worst] ? check.status : worst),
        "healthy"
    );

    return { status, checks };
}

export function startSystemReporter(transmitter: DigiforgeClient, intervalMs: number) {
    async function report() {
        try {
            const info = await getSystemInfo();
            const payload = {
                system: {
                    ...info,
                    health: getSystemHealth(info),
                },
            };
            console.log("Transmitting System");
            transmitter.transmit(JSON.stringify(payload));
        } catch (err) {
            console.error("Erreur lors de la collecte système:", err);
        }
    }

    report();
    return setInterval(report, intervalMs);
}
