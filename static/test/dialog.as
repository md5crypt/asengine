location dialogBox
	object up
		on use
			set dialog.offset = dialog.offset - 1
			showDialog
	object down
		on use
			set dialog.offset = dialog.offset + 1
			showDialog
	object line1
		on use lineAction 0
	object line2
		on use lineAction 1
	object line3
		on use lineAction 2

	set self.lines = [line1 line2 line3]
	for i in 0:3
		set ((self.lines i) "font") = '{"fontSize":"\'Work Sans\'","fontSize":18,"leading":4}'

	function lineAction n:integer
		hideDialog
		(((dialog.stack 0) "options") dialog.offset + n)
		dialog.start

	function showDialog
		set stage.main.disabled = true
		set stage.ui.hidden = false
		set stage.ui.location = dialogBox
		local offset = dialog.offset
		local options = ((dialog.stack 0) "options")
		local len = {length options}
		for i in 0:3
			local line = (parent.lines i)
			set line.hidden = false
			if offset < len
				set line.text = ((options offset) "name")
				set line.hidden = false
			else
				set line.hidden = true
			set offset = offset + 1
		set up.hidden = false
		set down.hidden = false
		if dialog.offset == 0
			set up.disabled = true
			set up.sprite = "inactive"
		else
			set up.disabled = false
			set up.sprite = "active"
		if offset >= len
			set down.disabled = true
			set down.sprite = "inactive"
		else
			set down.disabled = false
			set down.sprite = "active"

	function hideDialog
		for i in 0:3
			set ((parent.lines i) "hidden") = true
		set up.hidden = true
		set down.hidden = true
		set stage.main.disabled = false
		set stage.ui.hidden = true

namespace `dialog
	set self.stack = []
	function push d:dialog
		array.unshift parent.stack d
	function replace d:dialog
		set (parent.stack 0) = d
	function pop
		local e = {array.shift parent.stack}
		if {length parent.stack} == 0
			dialogBox.hideDialog
		return e
	function exit
		local stack = parent.stack
		while {length stack}
			local e = {array.shift stack}
			trigger e "exit"
		dialogBox.hideDialog
	function start d?:dialog
		if d
			push d
		local stack = parent.stack
		while {length stack}
			local current = (stack 0)
			trigger current "start"
			if {length stack} && ((stack 0) == current)
				set parent.offset = 0
				dialogBox.showDialog
				break
