import { Stream as Stream$1, StreamGroupSubscription, StreamItemSubscription, StreamSubscription } from "@motiadev/stream-client";

//#region src/stream-adapter.ts
var StreamSocketAdapter = class {
	constructor(address, protocols) {
		this.address = address;
		this.onMessageListeners = [];
		this.onOpenListeners = [];
		this.onCloseListeners = [];
		this.ws = new WebSocket(this.address, protocols);
	}
	connect() {}
	send(message) {
		this.ws.send(message);
	}
	onMessage(callback) {
		const listener = (message) => callback(message.data);
		this.ws.addEventListener("message", listener);
		this.onMessageListeners.push(listener);
	}
	onOpen(callback) {
		this.ws.addEventListener("open", callback);
		this.onOpenListeners.push(callback);
	}
	onClose(callback) {
		this.ws.addEventListener("close", callback);
		this.onCloseListeners.push(callback);
	}
	close() {
		this.ws.close();
		this.onMessageListeners.forEach((listener) => this.ws.removeEventListener("message", listener));
		this.onOpenListeners.forEach((listener) => this.ws.removeEventListener("open", listener));
		this.onCloseListeners.forEach((listener) => this.ws.removeEventListener("close", listener));
	}
	isOpen() {
		return this.ws.readyState === WebSocket.OPEN;
	}
};

//#endregion
//#region src/stream.ts
var Stream = class extends Stream$1 {
	constructor(address, options) {
		super(() => new StreamSocketAdapter(address, options?.protocols));
	}
};

//#endregion
export { Stream, StreamGroupSubscription, StreamItemSubscription, StreamSubscription };
//# sourceMappingURL=index.js.map