location speech
	object textarea
		in self set
			font = '{"fontSize":"\'Work Sans\'","fontSize":18,"leading":4}'
		on use
			if {length self.buffer}
				set self.text = {array.shift self.buffer}
			else
				set stage.main.disabled = false
				set stage.ui.hidden = true
				thread.resume say.thread
				unset self.buffer
				unset self.text

	object avatar

function say who:character text:string sprite?:string
	local lines = {.text.measure text speech.textarea 'default'}
	in speech.textarea set
		buffer = lines
		text = {array.shift lines}
	in speech.avatar set
		proxyObject = who
		proxySprite = sprite || 'default'
	set stage.ui.location = speech
	set stage.main.disabled = true
	set stage.ui.hidden = false
	set self.thread = {thread.current}
	_yield
	unset self.thread
