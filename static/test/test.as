location speech
	object textarea
		in self set
			lorem = {text.measure "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum." self 'default'}
			text = (self.lorem 0)
			index = 0
			fontColor = "red"
			fontFamily = "Comic Sans MS"
		on use
			set self.index = (self.index + 1) % {length self.lorem}
			set self.text = (self.lorem self.index)
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
		on use set self.sprite = (self.sprite == "alive") ? "dead" : "alive"

	object sun
		on use
			if self.rendered
				stage.hide "ui"
			else
				stage.show "ui"
			set self.rendered = !self.rendered

	function fucking_cow
		while true
			set cow.sprite = "frame1"
			delay 500
			set cow.sprite = "frame2"
			delay 500

stage.render "main" village
stage.create "ui" 1
stage.render "ui" speech
stage.show "main"