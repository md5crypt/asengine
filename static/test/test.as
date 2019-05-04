extern render '__render'
extern delay '__delay'

location village
	object cow
		on use 
			unset cow.thread
			set cow.hidden = true
			render cow
	object mouse
		on use
			set village.mouse.frame = (village.mouse.frame == "alive") ? "dead" : "alive"
			render village.mouse
	object sun

	function fucking_cow
		while true
			print cow.hidden
			set cow.frame = "frame1"
			render cow
			delay 500
			set cow.frame = "frame2"
			render cow
			delay 500

render village

set village.cow.thread = {async village.fucking_cow}