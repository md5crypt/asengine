location village
	object cow
		on use 
			hide self
			unset self.thread

	object mouse
		on use show self (self.frame == "alive") ? "dead" : "alive"

	object sun
		on use
			if !cow.thread
				print "starting cow"
				set cow.thread = {async fucking_cow}

	function fucking_cow
		while true
			show cow "frame1"
			delay 500
			show cow "frame2"
			delay 500

render village