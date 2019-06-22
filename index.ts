import { AsVm, vm_mmid_t, vm_variable_t, vm_hashmap_t, vm_thread_t, vm_array_t } from "./casvm/emscripten/asvm"
import { ResourceFile, ResourceFrame, ResourceGroup, ResourceImageType } from "./asrc/ResourceFile"

interface ThreadTimer {
	expire: number
	thread: vm_mmid_t
}

class ArrayContainer extends PIXI.Container {
	protected _boundsID!: number
	public setChildAt(child: PIXI.DisplayObject, index: number) {
		(this.children[index] as any).parent = null
		if (child.parent) {
			child.parent.removeChild(child)
		}
		this.children[index] = child;
		(child as any).parent = this
		child.updateTransform()
		this._boundsID++
	}

	public hitTest(point: PIXI.Point) {
		if (this.visible && this.interactive) {
			const transformed = new PIXI.Point()
			for (let i = this.children.length - 1; i > 0; i--) {
				const sprite = this.children[i]
				if (sprite.visible && sprite.interactive) {
					sprite.worldTransform.applyInverse(point, transformed)
					if (sprite.hitArea.contains(transformed.x, transformed.y)) {
						return i
					}
				}
			}
		}
		return 0
	}
}

class HitmapRectangle extends PIXI.Rectangle {
	private hitmap: Uint8Array
	private xstep: number
	private ystep: number
	private xdiv: number

	constructor(image: AsEngine.ImageData) {
		if (!image.hitmap) {
			throw new Error(`can not create hitmap: no hitmap data`)
		}
		super(0, 0, image.width, image.height)
		const xdiv = Math.floor(Math.sqrt(((image.hitmap.length * 8) * image.width) / image.height))
		const ydiv = Math.floor((image.hitmap.length * 8) / xdiv)
		this.xstep = Math.ceil(image.width / xdiv)
		this.ystep = Math.ceil(image.height / ydiv)
		this.xdiv = xdiv
		this.hitmap = image.hitmap
	}

	public contains(x: number, y: number): boolean {
		if (super.contains(x, y)) {
			const index = (Math.floor(y / this.ystep) * this.xdiv) + Math.floor(x / this.xstep)
			return (this.hitmap[index >> 3] & (1 << (index & 7))) > 0
		} else {
			return false
		}
	}
}

class AsEngine {
	public readonly vm: AsVm
	public readonly objectMap: Map<vm_mmid_t, AsEngine.ObjectData>
	public readonly frameMap: Map<number, AsEngine.FrameData>
	public readonly imageMap: Map<string, AsEngine.ImageData>
	public readonly app: PIXI.Application
	private stage: AsEngine.StageData[]
	private dispatcher: vm_mmid_t
	private timers: ThreadTimer[]
	private runTimeout: NodeJS.Timeout | null
	private busy: boolean
	private dirty: boolean
	private cursor: PIXI.Sprite

	constructor(vm: AsVm, app: PIXI.Application) {
		this.vm = vm
		this.app = app
		this.timers = []
		this.runTimeout = null
		this.busy = false
		this.dirty = false
		this.imageMap = new Map()
		this.objectMap = new Map()
		this.frameMap = new Map()
		this.dispatcher = 0
		this.stage = []
		this.app.stage.interactiveChildren = false
		this.app.stage.interactive = true
		this.app.stage.hitArea = this.app.screen.clone()
		this.cursor = new PIXI.Sprite(PIXI.Texture.EMPTY)
	}

	private hitTest(point: PIXI.Point) {
		for (let i = this.stage.length - 1; i >= 0; i--) {
			const result = this.stage[i].container.hitTest(point)
			if(result) {
				for (const object of this.stage[i].location!.objectMap!.values()) {
					if (object.zindex == (result - 1)) {
						return object.mmid
					}
				}
				throw new Error("wtf?")
			}
		}
		return 0 as vm_mmid_t
	}

	public init(image: ArrayBuffer, resources: ResourceFile) {
		this.vm.vmInit(new Uint8Array(image))
		this.loadResources(resources)
		this.app.stage.on('pointertap', (e: PIXI.interaction.InteractionEvent) => {
			const mmid = this.hitTest(e.data.global)
			if (mmid) {
				this.vm.vmCall(
					this.dispatcher,
					{type: AsVm.Type.OBJECT, value: mmid},
					{type: AsVm.Type.STRING, value: this.vm.intern("click")}
				)
				this.run()
			}
		})
		const cursorVar = this.vm.resolve('__system.cursor')
		if (cursorVar.type == AsVm.Type.OBJECT) {
			const cursor = this.objectMap.get(cursorVar.value as vm_mmid_t)
			if (!cursor) {
				throw new Error("no cursor resource found")
			}
			const keys: [string, AsVm.Type][] = [['sprite', AsVm.Type.STRING]]
			let lastMmid = 0 as vm_mmid_t
			this.app.stage.on('mousemove', (e: PIXI.interaction.InteractionEvent) => {
				const o = this.vm.readHashmapKeys(this.vm.$._vm_memory_get_ptr(cursor.mmid) as vm_hashmap_t, keys) as {sprite?: vm_mmid_t}
				const name = o.sprite || this.vm.intern('default')
				const texture = cursor.frameMap.get(name)
				if (!texture) {
					console.log(`cursor sprite "${this.vm.readVmString(name)}" not found`)
				} else {
					this.cursor.texture = texture.image.texture!
					const point = this.app.stage.worldTransform.applyInverse(e.data.global)
					this.cursor.position.set(point.x + texture.left - 64, point.y + texture.top - 64)
				}
				const mmid = this.hitTest(e.data.global)
				if (lastMmid != mmid) {
					if (lastMmid) {
						this.vm.vmCall(
							this.dispatcher,
							{type: AsVm.Type.OBJECT, value: lastMmid},
							{type: AsVm.Type.STRING, value: this.vm.intern("pointerLeave")}
						)
					}
					if (mmid) {
						this.vm.vmCall(
							this.dispatcher,
							{type: AsVm.Type.OBJECT, value: mmid},
							{type: AsVm.Type.STRING, value: this.vm.intern("pointerEnter")}
						)
					}
					this.run()
				}
				lastMmid = mmid
			})
		}
	}

	private readStageData() {
		const vm = this.vm
		const stage = vm.resolve('__system.stage')
		if (!stage || (stage.type != AsVm.Type.ARRAY)) {
			throw new Error("__system_stage missing or invalid")
		}
		const stageArray = vm.readArray(vm.$._vm_memory_get_ptr(stage.value as vm_mmid_t) as vm_array_t)
		for (const variable of stageArray) {
			if (!AsVm.isType(variable.type, AsVm.Type.HASHMAP)) {
				throw new Error("invalid value in __system_stage")
			}
			const container = new ArrayContainer()
			container.visible = false
			this.app.stage.addChild(container)
			this.stage.push({
				mmid: variable.value as vm_mmid_t,
				render: true,
				location: null,
				container
			})
		}
		this.app.stage.addChild(this.cursor)
	}

	public run() {
		if (this.busy) {
			this.dirty = true
			return
		}
		this.dirty = false
		if (this.runTimeout !== null) {
			clearTimeout(this.runTimeout)
			this.runTimeout = null
		}
		const time = Date.now()
		const newTimers = []
		for (const timer of this.timers) {
			const thread = this.vm.$._vm_memory_get_ptr(timer.thread) as vm_thread_t
			const rcnt = this.vm.$u32[(thread + vm_thread_t.rnct) / 4]
			if (rcnt == 1) {
				this.vm.$._vm_dereference(thread, AsVm.Type.THREAD)
			} else if (timer.expire <= time) {
				this.vm.$._vm_dereference(thread, AsVm.Type.THREAD)
				this.vm.$._vm_thread_push(thread)
			} else {
				newTimers.push(timer)
			}
		}
		this.timers = newTimers
		this.vm.vmRun()
		this.render()
		if (this.timers.length) {
			this.busy = true
			requestAnimationFrame(() => {
				this.busy = false
				if (this.dirty) {
					this.run()
				} else {
					let min = Infinity
					for (const timer of this.timers) {
						min = Math.min(min, timer.expire)
					}
					this.runTimeout = setTimeout(() => (this.runTimeout = null, this.run()), Math.max(0, min - Date.now()))
				}
			})
		}
	}

	public pushThread(thread: vm_mmid_t, delay: number) {
		this.vm.$._vm_reference_m(thread)
		this.timers.push({expire: Date.now() + delay, thread})
	}

	private buildFrameMap(frames: ResourceFrame[]) {
		const vm = this.vm
		const images = this.imageMap
		const frameMap: Map<vm_mmid_t, AsEngine.FrameData> = new Map()
		const defaultKey = vm.intern("default")
		for (const frame of frames) {
			const frameObject = {
				image: images.get(frame.image)!,
				left: frame.left,
				top: frame.top,
				id: this.frameMap.size
			}
			frameMap.set(vm.intern(frame.name), frameObject)
			this.frameMap.set(frameObject.id, frameObject)
		}
		if (!frameMap.has(defaultKey) && (frames.length > 0)) {
			frameMap.set(defaultKey, frameMap.get(vm.intern(frames[0].name))!)
		}
		return frameMap
	}

	private loadResourceImages(resourceFile: ResourceFile) {
		const images = this.imageMap
		for (const image of resourceFile.images){
			const imageData: AsEngine.ImageData = {
				height: image.height,
				width: image.width,
				type: image.type
			}
			if (image.type == ResourceImageType.FRAME) {
				imageData.texture = PIXI.Texture.from(`/images/${image.hash}.png`)
			}
			if (image.hitmap) {
				const data = atob(image.hitmap)
				const hitmap = new Uint8Array(data.length)
				for (let i = 0; i < data.length; i++) {
					hitmap[i] = data.charCodeAt(i)
				}
				imageData.hitmap = hitmap
			}
			images.set(image.hash, imageData)
		}
	}

	private loadResourceGroup(group: ResourceGroup, zindex: number, parent?: vm_mmid_t) {
		const vm = this.vm
		const vmVariable = vm.resolve(group.name, parent)
		if (!AsVm.isType(vmVariable.type, AsVm.Type.HASHMAP)) {
			throw new Error(`could not resolve resource ${parent ? vm.getHashmapPath(parent) + '.' : '' }${group.name}: got type '${AsVm.typeLut[vmVariable.type]}', expected 'hashmap'`)
		}
		const object: AsEngine.ObjectData = {
			mmid: vmVariable.value as vm_mmid_t,
			type: vmVariable.type,
			zindex,
			frameMap: this.buildFrameMap(group.frames)
		}
		if (group.children) {
			const children: Map<vm_mmid_t, AsEngine.ObjectData> = new Map()
			for (let i = 0; i < group.children.length; i++) {
				const child = this.loadResourceGroup(group.children[i], i, vmVariable.value as vm_mmid_t)
				children.set(child.mmid, child)
			}
			object.objectMap = children
		}
		this.objectMap.set(object.mmid, object)
		return object
	}

	private loadResources(resourceFile: ResourceFile) {
		this.loadResourceImages(resourceFile)
		for (let i = 0; i < resourceFile.groups.length; i++) {
			this.loadResourceGroup(resourceFile.groups[i], i)
		}
	}

	private render() {
		const vm = this.vm
		if (!this.dispatcher) {
			this.readStageData()
			const dispatch = this.vm.resolve('__system.dispatch')
			if (!dispatch || (dispatch.type != AsVm.Type.FUNCTION)) {
				throw new Error("click dispatcher not found")
			}
			this.dispatcher = dispatch.value as vm_mmid_t
		}
		for (const stageData of this.stage) {
			const hashmap = vm.$._vm_memory_get_ptr(stageData.mmid) as vm_hashmap_t
			if (vm.$u32[(hashmap + vm_hashmap_t.dirty) / 4]) {
				vm.$u32[(hashmap + vm_hashmap_t.dirty) / 4] = 0
				const props = vm.readHashmapKeys(hashmap, AsEngine.stageProps) as AsEngine.StageProps
				stageData.container.visible = !props.hidden
				stageData.container.interactive = !props.disabled
				if (!props.location) {
					stageData.location = null
				} else {
					const data = this.objectMap.get(props.location)
					if (!data) {
						throw new Error(`'${vm.getHashmapPath(props.location)}' has no resource information`)
					} else if (data.type != AsVm.Type.LOCATION) {
						throw new Error(`'${vm.getHashmapPath(props.location)}' is not a location`)
					} else {
						if (stageData.location != data) {
							stageData.render = true
						}
						stageData.location = data
					}
				}
			}
			if (stageData.container.visible) {
				this.renderStage(stageData)
			}
		}
	}

	public getTextStyle(mmid: vm_mmid_t, width?: number) {
		try {
			const json = JSON.parse(this.vm.readVmString(mmid)) as Object
			return new PIXI.TextStyle(width ? {...json, wordWrap: true, wordWrapWidth: width} : json)
		} catch {
			return AsEngine.fallbackTextStyle
		}
	}

	private createSprite(frame: AsEngine.FrameData, object: AsEngine.ObjectData): PIXI.Sprite | null {
		const vm = this.vm
		const hashmap = vm.$._vm_memory_get_ptr(object.mmid) as vm_hashmap_t
		let sprite: PIXI.Sprite | null = null
		switch (frame.image.type) {
			case ResourceImageType.FRAME:
				sprite = new PIXI.Sprite(frame.image.texture!)
				sprite.hitArea = new HitmapRectangle(frame.image)
				break
			case ResourceImageType.PROXY: {
				const exProps = vm.readHashmapKeys(hashmap, AsEngine.proxyObjectProps) as AsEngine.ProxyObjectProps
				const proxyObject = exProps.proxyObject && this.objectMap.get(exProps.proxyObject)
				if (!proxyObject) {
					console.error(`invalid proxyObject value '${exProps.proxyObject}' in '${vm.getHashmapPath(object.mmid)}'`)
					break
				}
				const proxyName = exProps.proxySprite || vm.intern('default')
				const proxyFrame = proxyObject.frameMap.get(proxyName)
				if (!proxyFrame) {
					console.error(`sprite '${vm.readVmString(proxyName)}' not found in object '${vm.getHashmapPath(proxyObject.mmid)}'`, proxyObject.frameMap, vm.intern('default'))
					break
				}
				sprite = this.createSprite(proxyFrame, proxyObject)
				if (sprite) {
					sprite.x += proxyFrame.left
					sprite.y += proxyFrame.top
				}
				break
			} case ResourceImageType.TEXT: {
				const exProps = vm.readHashmapKeys(hashmap, AsEngine.textObjectProps) as AsEngine.TextObjectProps
				sprite = new PIXI.Text(
					exProps.text ? vm.readVmString(exProps.text) : 'no text',
					exProps.font ? this.getTextStyle(exProps.font) : AsEngine.fallbackTextStyle
				)
				sprite.hitArea = new PIXI.Rectangle(0, 0, frame.image.width, frame.image.height)
				break
			} default:
				console.error(frame)
				throw new Error("unknown frame type")
		}
		return sprite
	}

	private drawObject(object: AsEngine.ObjectData, stage: AsEngine.StageData) {
		const vm = this.vm
		const hashmap = vm.$._vm_memory_get_ptr(object.mmid) as vm_hashmap_t
		if (!stage.render && !vm.$u32[(hashmap + vm_hashmap_t.dirty) / 4]) {
			// object did not change
			return
		}
		console.log(`drawing '${vm.getHashmapPath(object.mmid)}'`)
		const props = this.vm.readHashmapKeys(hashmap, AsEngine.baseObjectProps) as AsEngine.BaseObjectProps
		const name = props.sprite || this.vm.intern('default')
		const frame = object.frameMap.get(name)
		if (!frame) {
			console.log(`sprite '${vm.readVmString(name)}' not found in object '${vm.getHashmapPath(object.mmid)}'`)
		} else {
			const index = (stage.location == object) ? 0 : (object.zindex + 1)
			let sprite = this.createSprite(frame, object)
			if (!sprite) {
				sprite = new PIXI.Sprite(PIXI.Texture.EMPTY)
				sprite.visible = false
			} else {
				sprite.visible = !props.hidden
				sprite.interactive = !props.disabled
				sprite.x += frame.left + (props.left || 0)
				sprite.y += frame.top + (props.top || 0)
			}
			stage.container.setChildAt(sprite, index)
		}
		vm.$u32[(hashmap + vm_hashmap_t.dirty) / 4] = 0
	}

	private renderStage(stage: AsEngine.StageData) {
		if (!stage.location) {
			throw new Error("no location set")
		}

		if (stage.render) {
			stage.container.removeChildren()
			for (let i = 0; i < stage.location.objectMap!.size + 1; i++) {
				const sprite = new PIXI.Sprite(PIXI.Texture.EMPTY)
				sprite.visible = false
				stage.container.addChild(sprite)
			}
		}

		this.drawObject(stage.location, stage)
		for (const object of stage.location.objectMap!.values()) {
			this.drawObject(object, stage)
		}
		stage.render = false
		stage.container.visible = true
	}

	public getFrame(object: vm_mmid_t, name: vm_mmid_t) {
		const objectData = this.objectMap.get(object)
		if (objectData) {
			return objectData.frameMap.get(name) || null
		}
		return null
	}

	public static readonly fallbackTextStyle = new PIXI.TextStyle({fill: 'pink', fontSize: '18px', lineJoin: 'round', stroke: 'white', strokeThickness: 4})

	public static readonly baseObjectProps: AsVm.HashmapKeyList = [
		['hidden', AsVm.Type.BOOLEAN],
		['disabled', AsVm.Type.BOOLEAN],
		['top', AsVm.Type.INTEGER],
		['left', AsVm.Type.INTEGER],
		['sprite', AsVm.Type.STRING]
	]

	public static readonly proxyObjectProps: AsVm.HashmapKeyList = [
		['proxyObject', AsVm.Type.HASHMAP],
		['proxySprite', AsVm.Type.STRING]
	]

	public static readonly textObjectProps: AsVm.HashmapKeyList = [
		['text', AsVm.Type.STRING],
		['font', AsVm.Type.STRING],
	]

	public static readonly stageProps: AsVm.HashmapKeyList = [
		['location', AsVm.Type.LOCATION],
		['hidden', AsVm.Type.BOOLEAN],
		['disabled', AsVm.Type.BOOLEAN]
	]
}

namespace AsEngine {
	export interface ObjectData {
		mmid: vm_mmid_t
		type: AsVm.Type
		zindex: number
		objectMap?: Map<vm_mmid_t, ObjectData>
		frameMap: Map<vm_mmid_t, FrameData>
	}

	export interface FrameData {
		image: ImageData
		top: number
		left: number
		id: number
	}

	export interface ImageData {
		width: number
		height: number
		type: ResourceImageType
		texture?: PIXI.Texture
		hitmap?: Uint8Array
	}

	export interface StageData {
		mmid: vm_mmid_t
		location: AsEngine.ObjectData | null
		render: boolean
		container: ArrayContainer
	}

	export interface BaseObjectProps {
		hidden?: boolean
		disabled?: boolean
		top?: number
		left?: number
		sprite?: vm_mmid_t
	}

	export interface ProxyObjectProps extends BaseObjectProps {
		proxyObject?: vm_mmid_t
		proxySprite?: vm_mmid_t
	}

	export interface TextObjectProps extends BaseObjectProps {
		text: vm_mmid_t
		font?: vm_mmid_t
	}

	export interface StageProps {
		location?: vm_mmid_t
		hidden?: boolean
		disabled?: boolean
	}
}

window.addEventListener('load', async () => {
	const app = new PIXI.Application({width: 1366, height: 768})
	/* const resize = () => {
		const width = 1366
		const height = 768
		const vW = window.innerWidth
		const vH = window.innerHeight
		let nw
		let nh
		console.log(vH)
		if ((vH / vW) < (height / width)) {
			nh = vH
			nw = Math.round((vH * width) / height)
		} else {
			nw = vW
			nh = Math.round((vW * height) / width)
		}
		app.renderer.resize(nw, nh)
		app.stage.scale.set(nw / width)
	}
	window.addEventListener("resize", resize) */
	document.body.appendChild(app.view)
	const files = await Promise.all([
		axios.get("asvm.wasm", {responseType: 'arraybuffer'}),
		axios.get("test/__output/image.bin", {responseType: 'arraybuffer'}),
		axios.get("resource.json", {responseType: 'json'})
	])

	const vm = await AsVm.create(files[0].data as ArrayBuffer)
	const engine = new AsEngine(vm, app)
	// resize()

	function checkArgs(top: vm_variable_t, argc: number, expected: number, ...types: AsVm.Type[]): AsVm.Exception {
		if (argc != expected) {
			vm.$._vm_exception_arity(argc, 1)
			return AsVm.Exception.ARITY
		}
		for (let i = 0; i < types.length; i++) {
			if (!AsVm.isType(vm.getArgType(top, i + 1), types[i])) {
				vm.$._vm_exception_type(vm.getArgType(top, i + 1), types[i])
				return AsVm.Exception.TYPE
			}
		}
		return AsVm.Exception.NONE
	}

	vm.addFunction('__print', (top, argc) => {
		const exception = checkArgs(top, argc, 1, AsVm.Type.STRING)
		if (exception != AsVm.Exception.NONE) {
			return exception
		}
		console.log(vm.readVmString(vm.getArgValue(top, 1) as vm_mmid_t))
		return AsVm.Exception.NONE
	})

	vm.addFunction('__delay', (top, argc) => {
		const exception = checkArgs(top, argc, 1, AsVm.Type.INTEGER)
		if (exception != AsVm.Exception.NONE) {
			return exception
		}
		engine.pushThread(vm.$._vm_get_current_thread(), vm.getArgValue(top, 1, true))
		return AsVm.Exception.YIELD
	})

	vm.addFunction('__textMeasure', (top, argc) => {
		const exception = checkArgs(top, argc, 3, AsVm.Type.STRING, AsVm.Type.HASHMAP, AsVm.Type.STRING)
		if (exception != AsVm.Exception.NONE) {
			return exception
		}
		const object = engine.objectMap.get(vm.getArgValue(top, 2) as vm_mmid_t)
		if (!object) {
			vm.setReturnValue(top, vm.createVmString("object has no resources"), AsVm.Type.STRING)
			return AsVm.Exception.USER
		}
		const frame = object.frameMap.get(vm.getArgValue(top, 3) as vm_mmid_t)
		if (!frame) {
			vm.setReturnValue(top, vm.createVmString("sprite not found"), AsVm.Type.STRING)
			return AsVm.Exception.USER
		}
		const text = vm.readVmString(vm.getArgValue(top, 1) as vm_mmid_t).replace(/\s+/g, ' ').trim()
		const hashmap = vm.$._vm_memory_get_ptr(object.mmid) as vm_hashmap_t
		const props = vm.readHashmapKeys(hashmap, AsEngine.textObjectProps) as AsEngine.TextObjectProps
		const result = PIXI.TextMetrics.measureText(
			text,
			props.font ? engine.getTextStyle(props.font, frame.image.width) : AsEngine.fallbackTextStyle
		)
		const linesPerFrame = Math.floor(frame.image.height / result.lineHeight)
		const blocks: string[] = []
		while (result.lines.length > linesPerFrame) {
			blocks.push(result.lines.splice(0, linesPerFrame).join('\n'))
		}
		if (result.lines.length > 0) {
			blocks.push(result.lines.join('\n'))
		}
		const output = blocks.map(x => vm.createVmString(x))
		const array = vm.$._vm_array_create(output.length)
		const arrayPtr = vm.$._vm_memory_get_ptr(array) as vm_array_t
		for (let i = 0; i < output.length; i++) {
			vm.$._vm_array_set(arrayPtr, i, output[i], AsVm.Type.STRING)
		}
		vm.setReturnValue(top, array, AsVm.Type.ARRAY)
		return AsVm.Exception.NONE
	})

	engine.init(files[1].data as ArrayBuffer, files[2].data as ResourceFile)
	engine.run()
})
