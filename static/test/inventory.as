location inventory
	set self.array = []
	set self.boxes = [box1 box2 box3 box4 box5 box6]
	set self.offset = 0

	object closeBtn
		on use inventory.close
	object down
		on use
			set parent.offset = parent.offset + 3
			show
		show
	object up
		on use
			set parent.offset = parent.offset - 3
			show
	object box1
	object box2
	object box3
	object box4
	object box5
	object box6
	object grid

	function close
		set stage.main.disabled = false
		set stage.ui.hidden = true

	function show
		set stage.main.disabled = true
		set stage.ui.hidden = false
		set stage.ui.location = inventory
		local inv = parent.array
		local offset = parent.offset
		local len = {length inv}
		print "$offset $len"
		if len <= offset + 3
			set offset = len - 6
			if offset < 0 set offset = 0
			set parent.offset = offset
		if (offset % 3) != 0
			set offset = offset - (offset % 3)
			set parent.offset = offset
		for i in 0:6
			local box = (parent.boxes i)
			if offset < len
				in box set
					proxyObject	= (inv offset)
					hidden = false
				set offset = offset + 1
			else
				set box.hidden = true
		if parent.offset == 0
			set up.hidden = true
		else
			set up.hidden = false
		if len <= offset
			set down.hidden = true
		else
			set down.hidden = false
