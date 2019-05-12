location speech
	object textarea
	object avatar
		in self set
			sprite = {sprite.get village.cow "default"}
			display = "absolute"
			top = {sprite.top {sprite.get self "default"}}
			left = {sprite.left {sprite.get self "default"}}

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
		on use show self (self.sprite == "alive") ? "dead" : "alive"

	object sun
		on use
			if self.rendered
				stage.hide "ui"
			else
				stage.show "ui"
			set self.rendered = !self.rendered

	function fucking_cow
		while true
			show cow "frame1"
			delay 500
			show cow "frame2"
			delay 500

stage.render "main" village
stage.create "ui" 1
stage.render "ui" speech
stage.show "main"
