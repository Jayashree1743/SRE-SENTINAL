import { v4 } from "/uuid.js";

//#region src/stream-subscription.ts
var StreamSubscription = class {
	constructor(sub, state) {
		this.customEventListeners = /* @__PURE__ */ new Map();
		this.closeListeners = /* @__PURE__ */ new Set();
		this.onChangeListeners = /* @__PURE__ */ new Set();
		this.sub = sub;
		this.state = state;
	}
	onEventReceived(event) {
		const customEventListeners = this.customEventListeners.get(event.type);
		if (customEventListeners) {
			const eventData = event.data;
			customEventListeners.forEach((listener) => listener(eventData));
		}
	}
	/**
	* Add a custom event listener. This listener will be called whenever the custom event is received.
	*/
	onEvent(type, listener) {
		const listeners = this.customEventListeners.get(type) || [];
		this.customEventListeners.set(type, [...listeners, listener]);
	}
	/**
	* Remove a custom event listener.
	*/
	offEvent(type, listener) {
		const listeners = this.customEventListeners.get(type) || [];
		this.customEventListeners.set(type, listeners.filter((l) => l !== listener));
	}
	onClose(listener) {
		this.closeListeners.add(listener);
	}
	close() {
		this.closeListeners.forEach((listener) => listener());
		this.closeListeners.clear();
	}
	/**
	* Add a change listener. This listener will be called whenever the state of the group changes.
	*/
	addChangeListener(listener) {
		this.onChangeListeners.add(listener);
	}
	/**
	* Remove a change listener.
	*/
	removeChangeListener(listener) {
		this.onChangeListeners.delete(listener);
	}
	/**
	* Get the current state of the group.
	*/
	getState() {
		return this.state;
	}
	setState(state) {
		this.state = state;
		this.onChangeListeners.forEach((listener) => listener(state));
	}
};

//#endregion
//#region src/stream-group.ts
var StreamGroupSubscription = class extends StreamSubscription {
	constructor(sub, sortKey) {
		super(sub, []);
		this.sortKey = sortKey;
		this.lastTimestamp = 0;
		this.lastTimestampMap = /* @__PURE__ */ new Map();
	}
	sort(state) {
		const sortKey = this.sortKey;
		if (sortKey) return state.sort((a, b) => {
			const aValue = a[sortKey];
			const bValue = b[sortKey];
			if (aValue && bValue) return aValue.toString().localeCompare(bValue.toString());
			return 0;
		});
		return state;
	}
	setState(state) {
		super.setState(this.sort(state));
	}
	listener(message) {
		if (message.event.type === "sync") {
			if (message.timestamp < this.lastTimestamp) return;
			this.lastTimestampMap = /* @__PURE__ */ new Map();
			this.lastTimestamp = message.timestamp;
			this.setState(message.event.data);
		} else if (message.event.type === "create") {
			const id = message.event.data.id;
			const state = this.getState();
			if (!state.find((item) => item.id === id)) this.setState([...state, message.event.data]);
		} else if (message.event.type === "update") {
			const messageData = message.event.data;
			const messageDataId = messageData.id;
			const state = this.getState();
			const currentItemTimestamp = this.lastTimestampMap.get(messageDataId);
			if (currentItemTimestamp && currentItemTimestamp >= message.timestamp) return;
			this.lastTimestamp = message.timestamp;
			this.lastTimestampMap.set(messageDataId, message.timestamp);
			this.setState(state.map((item) => item.id === messageDataId ? messageData : item));
		} else if (message.event.type === "delete") {
			const messageDataId = message.event.data.id;
			const state = this.getState();
			this.lastTimestamp = message.timestamp;
			this.lastTimestampMap.set(messageDataId, message.timestamp);
			this.setState(state.filter((item) => item.id !== messageDataId));
		} else if (message.event.type === "event") this.onEventReceived(message.event.event);
	}
};

//#endregion
//#region src/stream-item.ts
var StreamItemSubscription = class extends StreamSubscription {
	constructor(sub) {
		super(sub, null);
		this.lastEventTimestamp = 0;
	}
	listener(message) {
		if (message.timestamp <= this.lastEventTimestamp) return;
		this.lastEventTimestamp = message.timestamp;
		if (message.event.type === "sync" || message.event.type === "create" || message.event.type === "update") this.setState(message.event.data);
		else if (message.event.type === "delete") this.setState(null);
		else if (message.event.type === "event") this.onEventReceived(message.event.event);
	}
};

//#endregion
//#region src/stream.ts
var Stream = class {
	constructor(adapterFactory) {
		this.adapterFactory = adapterFactory;
		this.listeners = {};
		this.ws = this.createSocket();
	}
	createSocket() {
		this.ws = this.adapterFactory();
		this.ws.onMessage((message) => this.messageListener(message));
		this.ws.onOpen(() => this.onSocketOpen());
		this.ws.onClose(() => this.onSocketClose());
		return this.ws;
	}
	/**
	* Subscribe to an item in a stream.
	*
	* @argument streamName - The name of the stream to subscribe to.
	* @argument groupId - The id of the group to subscribe to.
	* @argument id - The id of the item to subscribe to.
	*/
	subscribeItem(streamName, groupId, id) {
		const subscription = new StreamItemSubscription({
			streamName,
			groupId,
			id,
			subscriptionId: v4()
		});
		this.subscribe(subscription);
		return subscription;
	}
	/**
	* Subscribe to a group in a stream.
	*
	* @argument streamName - The name of the stream to subscribe to.
	* @argument groupId - The id of the group to subscribe to.
	*/
	subscribeGroup(streamName, groupId, sortKey) {
		const subscription = new StreamGroupSubscription({
			streamName,
			groupId,
			subscriptionId: v4()
		}, sortKey);
		this.subscribe(subscription);
		return subscription;
	}
	close() {
		this.listeners = {};
		this.ws.close();
	}
	onSocketClose() {
		setTimeout(() => this.createSocket(), 2e3);
	}
	onSocketOpen() {
		Object.values(this.listeners).forEach((listeners) => {
			listeners.forEach((subscription) => this.join(subscription));
		});
	}
	messageListener(event) {
		const message = JSON.parse(event);
		const room = this.roomName(message);
		this.listeners[room]?.forEach((listener) => listener.listener(message));
		if (message.id && message.event.type !== "sync") {
			const groupRoom = this.roomName({
				streamName: message.streamName,
				groupId: message.groupId
			});
			this.listeners[groupRoom]?.forEach((listener) => listener.listener(message));
		}
	}
	subscribe(subscription) {
		const room = this.roomName(subscription.sub);
		if (!this.listeners[room]) this.listeners[room] = /* @__PURE__ */ new Set();
		this.listeners[room].add(subscription);
		this.join(subscription);
		subscription.onClose(() => {
			this.listeners[room]?.delete(subscription);
			this.leave(subscription);
		});
	}
	join(subscription) {
		if (this.ws.isOpen()) this.ws.send(JSON.stringify({
			type: "join",
			data: subscription.sub
		}));
	}
	leave(subscription) {
		if (this.ws.isOpen()) this.ws.send(JSON.stringify({
			type: "leave",
			data: subscription.sub
		}));
	}
	roomName(message) {
		return message.id ? `${message.streamName}:group:${message.groupId}:item:${message.id}` : `${message.streamName}:group:${message.groupId}`;
	}
};

//#endregion
export { Stream, StreamGroupSubscription, StreamItemSubscription, StreamSubscription };