character narrator

location village "xoxoxo"
	object test1
		on use dialog.start .test

	object test2
		on use inventory.show

	object cow
		on use
			if self.sprite != "aaa"
				set self.sprite = "aaa"
				waitForLoop self
				waitForLoop self
				waitForLoop self
				set self.sprite = "frame1"
			#=if !self.thread
				print "starting cow"
				set self.thread = {async fucking_cow}
			else
				unset self.thread=#

	object mouse
		on use
			set self.sprite = (self.sprite == "alive") ? "dead" : "alive"
			local a = {array.create 6}
			memstat a
			print a

	object sun
		on use
			say narrator "
				Apparently we had reached a great height in the atmosphere, for the sky
				was a dead black, and the stars had ceased to twinkle. By the same illusion
				which lifts the horizon of the sea to the level of the spectator on a hillside,
				the sable cloud beneath was dished out, and the car seemed to float in the middle
				of an immense dark sphere, whose upper half was strewn with silver. Looking down
				into the dark gulf below, I could see a ruddy light streaming through a rift in the clouds."
			say narrator "oh fuck that" "one"

	function fucking_cow
		while true
			set cow.sprite = "frame1"
			delay 50
			set cow.sprite = "frame2"
			delay 50

dialog test
	option "test line 1"
		say narrator "haha haha"
		dialog.push test2
	option "test line 2" say narrator "I could see a ruddy light streaming through a rift in the clouds"
	option "test line 3" say narrator "By the same illusion which lifts the horizon of the sea to the level of the spectator on a hillside"
	option "test line 4" say narrator "The sable cloud beneath was dished out"
	option "test line 5 (exit)" dialog.exit


dialog test2
	option "test line 6" say narrator "Apparently we had reached a great height in the atmosphere"
	option "test line 7" dialog.pop

set stage.main.location = village
set stage.main.hidden = false
set stage.main.disabled = false

item testItem1
item testItem2
item testItem3

set inventory.array = [
	testItem1
	testItem2
	testItem3
	testItem2
	testItem1
	testItem3
	testItem3
	testItem2
	testItem1
	testItem3
]

set village.cow.sprite = "aaa"
tween.start village.mouse 1000 0 2000
tween.start village.cow 100 100 1000
tween.wait village.cow
tween.start village.cow -100 -200 500
tween.wait village.cow
set village.cow.sprite = "frame1"