namespace array
	extern create '__arrayCreate'
	extern static '__arrayStatic'
	extern push '__arrayPush'
	extern pop '__arrayPop'
	extern shift '__arrayShift'
	extern unshift '__arrayUnshift'
	extern resize '__arrayResize'
	extern slice '__arraySlice'
	extern write '__arrayWrite'
	extern fill '__arrayFill'
	extern find '__arrayFind'
	extern expand '__arrayExpand'
	extern reverse '__arrayReverse'
	function compare a:array b:array n?:integer
		local la = {length a}
		local lb = {length b}
		if {typeof n} == "undefined"
			if la != lb return false
			set n = la
		for i in 0 : n
			if (a i) != (b i) return false
		return true
	function join A:array glue?:string
		local n = {length A}
		if n == 0
			return ''
		set glue = {istype glue "string"} ? glue : ' '
		local e = (A 0)
		local str = {istype e "array"} ? '<:array>' : {string.from e}
		for i in 1:n
			set e = (A i)
			set str = "$str$glue$({istype e "array"} ? '<:array>' : {string.from (A i)})"
		return str

namespace string
	extern concat '__stringConcat'
	extern find '__stringFind'
	extern slice '__stringSlice'
	function `from value:any
		if {istype value 'string'}
			return "\"$value\""
		if {istype value 'integer'}
			return {itos value}
		if {istype value 'float'}
			return {dtos value}
		if {istype value 'boolean'}
			return value?'true':'false'
		if {istype value 'undefined'}
			return 'undefined'
		if {istype value 'array'}
			return "[${array.join value}]"
		if {istype value 'hashmap'}
			return "<${hashmap.path value}:${typeof value}>"
		return "<:${typeof value}>"
	function split str:string glue:string
		local out = []
		local offset = 0
		while true
			local p = {string.find str glue offset}
			if p < 0
				return {array.push out {string.slice str offset}}
			array.push out {string.slice str offset p}
			set offset = p + 1

namespace hashmap
	extern has '__hashmapHas'
	extern keys '__hashmapKeys'
	extern values '__hashmapValues'
	function path node:hashmap
		local path = {nameof node}
		while node.parent
			set node = node.parent
			set path = {nameof node}+'.'+path
		return path

namespace thread
	extern current '__threadCurrent'
	extern resume '__threadResume'
	extern detach '__threadDetach'
	extern reattach '__threadReattach'

namespace tween
	extern start '__tweenPush'
	extern stop '__tweenDelete'
	#extern trace '__tweenTrace'

	function trace tmp x0 y0 x1 y1
		return [x0 y0 x1 y1]

	function wait target:hashmap
		local list = target._tweenThreadList
		if {istype list "array"}
			array.push list {thread.current}
		else
			set target._tweenThreadList = [{thread.current}]
		_yield

	namespace directions
		function setRight target:object
			print {nameof self}
			if target.walkRight
				set target.sprite = target.walkRight
			elseif target.walkLeft
				set target.sprite = target.walkLeft
				set target.scale = -target.scale
			else
				throw "walkRight nither walkLeft is set in ${string.from target}"

		function setLeft target:object
			print {nameof self}
			if target.walkLeft
				set target.sprite = target.walkLeft
			elseif target.walkRight
				set target.sprite = target.walkRight
				set target.scale = -target.scale
			else
				throw "walkRight nither walkLeft is set in ${string.from target}"

		function setTop target:object
			print {nameof self}
			if target.walkTop
				set target.sprite = target.walkTop
				return true
			return false

		function setBottom target:object
			print {nameof self}
			if target.walkBottom
				set target.sprite = target.walkBottom
				return true
			return false

		function setTopRight target:object
			print {nameof self}
			if target.walkTopRight
				set target.sprite = target.walkTopRight
				return true
			if target.walkTopLeft
				set target.sprite = target.walkTopLeft
				set target.scale = -target.scale
				return true
			return false

		function setTopLeft target:object
			print {nameof self}
			if target.walkTopLeft
				set target.sprite = target.walkTopLeft
				return true
			if target.walkTopRight
				set target.sprite = target.walkTopRight
				set target.scale = -target.scale
				return true
			return false

		function setBottomRight target:object
			print {nameof self}
			if target.walkBottomRight
				set target.sprite = target.walkBottomRight
				return true
			if target.walkBottomLeft
				set target.sprite = target.walkBottomLeft
				set target.scale = -target.scale
				return true
			return false

		function setBottomLeft target:object
			print {nameof self}
			if target.walkBottomLeft
				set target.sprite = target.walkBottomLeft
				return true
			if target.walkBottomRight
				set target.sprite = target.walkBottomRight
				set target.scale = -target.scale
				return true
			return false

	function walk target:object x:integer y:integer
		set target.scale = target.scale || 1
		local path = {tween.trace target.parent.surface target.left target.top x y}
		set target.scale = target.scale || 1
		for i in 2:{length path}:2
			set target.scale = target.scale > 0 ? target.scale : -target.scale
			local dx = (path i + 0) - (path i - 2)
			local dy = (path i + 1) - (path i - 1)
			print dx dy
			if dx > 0
				if dy > 0
					if dx > dy
						if dx > (2 * dy)
							directions.setRight target
						else
							nop {directions.setBottomRight target} || {directions.setRight target}
					else
						if dy > (2 * dx)
							nop {directions.setBottom target} || {directions.setBottomRight target} || {directions.setRight target}
						else
							nop {directions.setBottomRight target} || {directions.setRight target}
				else
					if dx > -dy
						if dx > (-2 * dy)
							directions.setRight target
						else
							nop {directions.setTopRight target} || {directions.setRight target}
					else
						if -dy > (2 * dx)
							nop {directions.setTop target} || {directions.setTopRight target} || {directions.setRight target}
						else
							nop {directions.setTopRight target} || {directions.setRight target}
			else
				if dy > 0
					if -dx > dy
						if -dx > (2 * dy)
							directions.setLeft target
						else
							nop {directions.setBottomLeft target} || {directions.setLeft target}
					else
						if dy > (-2 * dx)
							nop {directions.setBottom target} || {directions.setBottomLeft target} || {directions.setLeft target}
						else
							nop {directions.setBottomLeft target} || {directions.setLeft target}
				else
					if -dx > -dy
						if -dx > (-2 * dy)
							directions.setLeft target
						else
							nop {directions.setTopLeft target} || {directions.setLeft target}
					else
						if -dy > (-2 * dx)
							nop {directions.setTop target} || {directions.setTopLeft target} || {directions.setLeft target}
						else
							nop {directions.setTopLeft target} || {directions.setLeft target}
			tween.start target dx dy target.speed
			tween.wait target
			# animation.wait target

namespace stdlib
	import [
		hashmap
		string
		array
		length
	] from root

extern typeof '__typeof'
extern nameof '__nameof'
extern length '__length'
extern stdout '__print'
extern itos '__itos'
extern dtos '__dtos'
extern memstat '__memStat'
function print ...
	local cnt = {_argc}
	for i in 0:cnt
		local s = {_argv i}
		if {typeof s} != "string"
			set s = {string.from s}
		stdout s + (i == cnt-1 ? "\n" : " ")

namespace text
	extern measure '__textMeasure'

extern delay '__delay'

namespace stage
	namespace main
		set self.hidden = true
	namespace ui
		set self.hidden = true

namespace __system
	function processThreadList list:any remove?:boolean
		if {istype list "array"}
			while {length list}
				if remove
					thread.reattach {array.pop list}
				else
					thread.resume {array.pop list}

	function walkWrapper loc:location x:integer y:integer
		local target = loc.player
		if target.walkThread
			print "notset"
			thread.reattach target.walkThread
		else
			print "set"
			set target.savedSprite = target.sprite
			set target.savedSign = (target.scale || 1) > 0
		set target.walkThread = {thread.current}
		tween.walk target x y
		unset target.walkThread
		print target.savedSprite
		set target.sprite = target.savedSprite
		if (target.scale > 0) != target.savedSign
			set target.scale = -target.scale

	namespace events
		function click target:namespace x:integer y:integer
			if {typeof target} == "location"
				if target.walkable
					walkWrapper target x y
			elseif {typeof target} == "object"
				if target.parent.walkable && target.parent.player != target
					walkWrapper target.parent x y
				if !target.disabled && target.__on_use
					target.__on_use
			else
				throw "invalid event target $(target)"
		function animationLoop target:object
			processThreadList target._animationThreadList
		function animationDestroy target:object
			processThreadList target._animationThreadList true
		function tweenEnd target:object
			processThreadList target._tweenThreadList
		function tweenDestroy target:object
			processThreadList target._tweenThreadList true
		function pointerEnter target:object
			if target.__on_use
				set __system.cursor.sprite = "action"
		function pointerLeave target:object
			set __system.cursor.sprite = "default"

	function dispatch event:string target:namespace x?:integer y?:integer
		print "$event ${string.from target}"
		if event == "click"
			events.click target x y
		else
			(events event) target

	set self.stage = [stage.main stage.ui]
	object cursor

namespace animation
	function once target:object sprite:string
		local savedSprite = target.sprite
		set target.sprite = sprite
		animation.wait target
		set target.sprite = savedSprite
		_yield
	function wait target:object
		local list = target._animationThreadList
		if {istype list "array"}
			array.push list {thread.current}
		else
			set target._animationThreadList = [{thread.current}]
		_yield

function trigger o:namespace name:string target?:namespace
	local func = (o "__on_$name")
	if {typeof func} == "event"
		if target
			func target
		else
			func
		return true
	return false
