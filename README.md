#Wave3
A state library for Google Wave gadgets

##namespace wave3

###static methods
- addLoadCallback(callback:function(), context?:object)
- addParticipantUpdateCallback(callback:function(partipant:wave.Participant), context?:object)
- addNewKeyCallback(callback:function(key:string), context?:object)

- startBuffer()
- endBuffer()
- flushBuffer()
- applyBuffer()
- buffer(callback:function(), context?:object)

###class StateItem
####constructor
- wave3.StateItem(key:string, onUpdate?:function(value:string), onDelete?:function(), context?:object)
####methods
- setValue(value:string)
- detatch()
####properties
- onUpdate:function(value:string)
- onDelete:function()