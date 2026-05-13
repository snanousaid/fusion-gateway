import { connect as CreateMqttConnection } from "mqtt";
import type { IClientPublishOptions, MqttClient } from "mqtt";

export interface IDigiforgeConfig {
  clientId: string;
  username: string;
  password: string;
  pub_topic: string;
  sub_topic: string;
}

export class DigiforgeClient {
  private _client: MqttClient;

  public id: string;

  private isConnected = false;
  private sub_topic: string;
  private pub_topic: string;

  get is_connected(): boolean {
    return this.isConnected;
  }

  constructor(opts: IDigiforgeConfig) {
    this._client = CreateMqttConnection("mqtt://stg-dp-mqtt.abafusion.ai:1884", {
      clientId: opts.clientId,
      username: opts.username,
      password: opts.password,
      manualConnect: true,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
      keepalive: 30,
      clean: true,
    });
    
    // this._client = CreateMqttConnection("mqtt://broker.emqx.io:1883", {
    //   // clientId: opts.clientId,
    //   // username: opts.username,
    //   // password: opts.password,
    //   manualConnect: true,
    // });



    this.id = opts.clientId;
    this.sub_topic = opts.sub_topic;
    this.pub_topic = opts.pub_topic;


    this._client.on("connect", () => {
      console.log("Connected to Digiforge");
      this.isConnected = true;
      this._client.subscribe(opts.sub_topic);
    });

    this._client.on("reconnect", () => {
      console.log("Reconnecting to Digiforge...");
    });

    this._client.on("close", () => {
      this.isConnected = false;
    });

    this._client.on("offline", () => {
      this.isConnected = false;
    });

    this._client.on("disconnect", () => {
      this.isConnected = false;
    });

    this._client.on("error", (err) => {
      console.error("MQTT error:", err.message);
      this.isConnected = false;
    });
  }

  async connect(): Promise<boolean> {
    if (this.isConnected) return true;
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this._client.removeListener("connect", onConnect);
        this._client.removeListener("error", onError);
        resolve(ok);
      };
      const onConnect = () => finish(true);
      const onError = (err: Error) => {
        console.error("Connection error:", err.message);
        finish(false);
      };
      const timer = setTimeout(() => {
        console.error("Connection timeout");
        finish(false);
      }, 30000);
      this._client.once("connect", onConnect);
      this._client.once("error", onError);
      if (!this._client.connected && !this._client.reconnecting) {
        this._client.connect();
      }
    });
  }

  transmit(data: string | Buffer) {
    if (this.isConnected) {
      this._client.publish(this.pub_topic, data);
    }
  }

  rawTransmit(
    topic: string,
    data: string | Buffer,
    opts?: IClientPublishOptions
  ) {
    if (this.isConnected) {
      this._client.publish(topic, data, opts);
    }
  }
}
