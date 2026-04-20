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
    // this._client = CreateMqttConnection("mqtt://mqtt.cloud.digieye.io", {
    //   clientId: opts.clientId,
    //   username: opts.username,
    //   password: opts.password,
    //   manualConnect: true,
    // });

    this._client = CreateMqttConnection("mqtt://test.mosquitto.org:1883", {
      // clientId: opts.clientId,
      // username: opts.username,
      // password: opts.password,
      manualConnect: true,
    });



    this.id = opts.clientId;
    this.sub_topic = opts.sub_topic;
    this.pub_topic = opts.pub_topic;


    this._client.on("connect", () => {
      console.log("Connected to Digiforge");
      this.isConnected = true;
      this._client.subscribe(opts.sub_topic);
    });

    this._client.on("reconnect", () => {
      this.isConnected = true;
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
  }

  async connect(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject("Connection timeout");
      }, 30000);
      this._client.once("connect", () => {
        clearTimeout(timer);
        resolve(true);
      });
      this._client.connect();
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
