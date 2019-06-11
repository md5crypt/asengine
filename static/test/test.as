location speech
	object textarea
		in self set
			fontColor = "red"
			fontFamily = "Comic Sans MS"
			fontSize = "32px"
		on use
			if {length self.buffer}
				set self.text = {array.pop self.buffer}
			else
				set stage.main.disabled = false
				set stage.ui.hidden = true
				thread.resume self.thread
				unset self.buffer
				unset self.text

	object avatar
		set self.proxyObject = village.cow

character narrator

location village "xoxoxo"
	object cow
		on use
			if !self.thread
				print "starting cow"
				set self.thread = {async fucking_cow}
			else
				unset self.thread

	object mouse
		on use
			set self.sprite = (self.sprite == "alive") ? "dead" : "alive"
			local a = {array.create 6}
			memstat a
			print a

	object sun
		on use
			say "hello my world. hello my world. hello my world. hello my world. hello my world. hello my world. hello my world. hello my world. hello my world. hello my world. hello my world."
			say "bl abla"

	function fucking_cow
		while true
			set cow.sprite = "frame1"
			delay 50
			set cow.sprite = "frame2"
			delay 50

set stage.main.location = village
set stage.ui.location = speech
set stage.main.hidden = false

function say text:string
	local lines = {.text.measure text speech.textarea 'default'}
	in speech.textarea set
		buffer = lines
		text = {array.pop lines}
		thread = {thread.current}
	set stage.main.disabled = true
	set stage.ui.hidden = false
	_yield
	unset speech.textarea.thread
