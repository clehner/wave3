/*
 * Wave3
 * A higher-level state API for Google Wave Gadgets.
 * 
 * Copyright (c) 2009 Charles Lehner
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

if (!wave || !gadgets) {
	throw new Error("Wave Gadget API is not available");
}

wave3 = (function () {
	var waveState, gadgetLoaded, stateUpdated, participantsUpdated,
		updateObjectState, removeObject, Stateful, onLoad, waveStateValues,
		waveStateKeys, sendObjectUpdate, wave3, participantCallback,
		
		participantsLoaded = false,
		stateWaiting = false,
		delta = {},
		constructors = {},
		stateObjects = {},
		stateObjectStates = {},
		waveStateKeys = [],
		pendingOutgoingUpdates = {};
	
	gadgetLoaded = function () {
		waveState = wave.getState();
		if (!waveState) {
			throw new Error("No state");
		}
		wave.setStateCallback(stateUpdated);
		wave.setParticipantCallback(participantsUpdated);
		if (typeof onLoad == "function") {
			onLoad();
		}
	};
	
	stateUpdated = function () {
		var keys, i, key, value;

		if (!participantsLoaded) {
			// wait until participants are loaded
			stateWaiting = true;
			return false;
		}
		
		keys = waveState.getKeys();
		waveStateValues = {};
		
		// Update stuff
		for (i = 0; (key = keys[i]); i++) {
			value = waveState.get(key);
			if (typeof value == "string") {
				waveStateValues[key] = value;
				
				updateObjectState(key, value);
			}
		}
		
		// Check for deleted keys
		for (i = waveStateKeys.length; i--;) {
			key = waveStateKeys[i];
			if (!(key in waveStateValues)) {
				removeObject(key);
			}
		}
		
		waveStateKeys = keys;
	};
	
	participantsUpdated = function (participants) {
		if (!participantsLoaded) {
			participantsLoaded = true;
			wave3.viewer = wave.getViewer();
			if (stateWaiting) {
				stateWaiting = false;
				stateUpdated();
			}
			wave3.setParticipantCallback = wave.setParticipantCallback;
			if (participantCallback) {
				wave.setParticipantCallback.apply(wave, participantCallback);
			}
		}
	};
	
	// Deal with an incoming state change for a state object
	updateObjectState = function (key, value) {
		var state, oldState, proto, constructor, object, subkey,
		delta = {};
		
		state = JSON.parse(value, function reviver(key, value) {
			var id, stateObject;
			if (typeof value == "object") {
				if ("_id" in value) {
					id = value._id;
					stateObject = stateObjects[id];
					if (stateObject) {
						return stateObject;
					} else {
						// do it later
					}
				} else if ("_pid" in value) {
					id = value._pid;
					return wave.getParticipantById(id);
				}
			}
			return value;
		});
		
		object = stateObjects[key];
		if (!object) {
			// First update. Instantiate the object
			proto = state._proto;
			if ((typeof proto == "string") && (proto in constructors)) {
				constructor = constructors[proto];
			} else {
				constructor = constructors[""] || Stateful;
			}
			object = stateObjects[key] = new constructor();
			object.id = key;
			oldState = {};
		
		} else {
			// Find removed keys
			oldState = stateObjectStates[key] || {};
			for (subkey in oldState) {
				if (!(subkey in state)) {
					delta[subkey] = undefined;
				}
			}
		}
		
		// Find changed keys
		for (subkey in state) {
			if (state[subkey] != oldState[subkey]) {
				delta[subkey] = state[subkey];
			}
		}
		
		stateObjectStates[key] = state;
		
		if ("_value" in state) {
			// non-object, single-value state
			delta = state = state._value;
		}
		
		object.update(delta, state);
	};
	
	removeObject = function (key) {
		var object = stateObjects[key];
		if (object) {
			object.remove();
			delete stateObjects[key];
			delete stateObjectStates[key];
		}
	};
	
	Stateful = function () {};
	Stateful.prototype = {
		id: "0",
		constructor: Stateful,
		update: function (changes) {},
		remove: function () {},
		submitDelta: function (delta) {
			var id, oldDelta, k;
			id = this.id;
			oldDelta = pendingOutgoingUpdates[id];
			if (oldDelta && (typeof delta == "object")) {
				for (k in delta) {
					oldDelta[k] = delta[k];
				}
			} else {
				pendingOutgoingUpdates[id] = delta;
			}
			if (!stateObjects[id]) {
				stateObjects[id] = this;
			}
		},
		toJSON: function () {
			return {_id: this.id};
		}
	};
	
	wave.Participant.prototype.toJSON = function () {
		return {_pid: this.id_};
	}
	
	wave3 = {
		Stateful: Stateful,
		
		// set an onload handler
		onLoad: function (handler) {
			onLoad = handler;
		},
		
		sendUpdates: function () {
			var key, k, object, oldState, newState, changes;
			
			for (key in pendingOutgoingUpdates) {
				object = stateObjects[key];
				oldState = stateObjectStates[key];
				changes = pendingOutgoingUpdates[key];
				if (typeof changes == "object") {
					newState = {};
					if (oldState) {
						for (k in oldState) {
							newState[k] = oldState[k];
						}
					} else {
						newState._proto = object._protoName;
					}
					for (k in changes) {
						newState[k] = changes[k];
					}
				} else {
					// non-object state
					newState = {
						_proto: object._protoName,
						_value: changes
					};
				}
				delta[key] = JSON.stringify(newState);
				// pre-emptive updating. might be a bad idea.
				//object.update(changes);
			}
			waveState.submitDelta(delta);
			delta = {};
		},
		
		addTypes: function (types) {
			for (var name in types) {
				constructors[name] = types[name];
				types[name].prototype._protoName = name;
			}
		},
		
		setParticipantCallback: function (a, b) {
			participantCallback = arguments;
		}
	};
	
	gadgets.util.registerOnLoadHandler(gadgetLoaded);
	
	return wave3;
})();