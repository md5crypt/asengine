import { AsVm, vm_mmid_t, vm_variable_t, vm_hashmap_t, vm_thread_t } from "./casvm/emscripten/asvm"
import * as ResourceTypes from "./asrc/ResourceTypes"


interface ThreadTimer {
	expire: number
	thread: vm_mmid_t
}

const enum RedrawRequest {
	NONE,
	LOCATION,
	ALL
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
	private vm: AsVm
	private location: AsEngine.LocationData | null
	private redrawRequest: RedrawRequest
	private updateSet: Set<AsEngine.ObjectData>
	private locationMap!: Map<vm_mmid_t, AsEngine.LocationData>
	private app: PIXI.Application
	private timers: ThreadTimer[]

	constructor(vm: AsVm, app: PIXI.Application) {
		this.vm = vm
		this.app = app
		this.location = null
		this.redrawRequest = RedrawRequest.NONE
		this.updateSet = new Set()
		this.timers = []
	}

	public requestRedrawObject(mmid: vm_mmid_t): string | null {
		if (!this.location) {
			return 'no active location'
		}
		const object = this.location.objectMap.get(mmid)
		if (!object) {
			const vm = this.vm
			const name = vm.readVmString(vm.$u32[(vm_hashmap_t.name + vm.$._vm_memory_get_ptr(mmid)) / 4])
			return `object '${name}' is not present in current location or does not have a resource definition`
		}
		this.updateSet.add(object)
		return null
	}

	public requestRedrawLocation(mmid: vm_mmid_t): string | null {
		if (this.location && (this.location.mmid == mmid)) {
			if (this.redrawRequest != RedrawRequest.ALL) {
				this.redrawRequest = RedrawRequest.LOCATION
			}
			return null
		} else {
			const location = this.locationMap.get(mmid)
			if (!location) {
				const vm = this.vm
				const name = vm.readVmString(vm.$u32[(vm_hashmap_t.name + vm.$._vm_memory_get_ptr(mmid)) / 4])
				return `location '${name}' does not have a resource definition`
			}
			this.location = location
			this.redrawRequest = RedrawRequest.ALL
			return null
		}
	}

	public requestRedrawScene() {
		this.redrawRequest = RedrawRequest.ALL
	}

	public run() {
		const time = Date.now()
		const newTimers = []
		for (const timer of this.timers) {
			const thread = this.vm.$._vm_memory_get_ptr(timer.thread) as vm_thread_t
			const rcnt = this.vm.$u32[(thread + vm_thread_t.rnct) / 4]
			console.log(rcnt)
			if (rcnt == 1) {
				this.vm.$._vm_dereference(thread, AsVm.Type.THREAD)
			} else if (timer.expire < time) {
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
			requestAnimationFrame(() => {
				let min = Infinity
				for (const timer of this.timers) {
					min = Math.min(min, timer.expire)
				}
				setTimeout(() => this.run(), Math.max(0, min - Date.now()))
			})
		}
	}

	private render() {
		if (this.redrawRequest == RedrawRequest.ALL) {
			this.redrawLocation()
		} else if (this.location) {
			this.updateLocation(this.redrawRequest == RedrawRequest.LOCATION)
		}
	}

	public pushThread(thread: vm_mmid_t, delay: number) {
		this.vm.$._vm_reference(thread, AsVm.Type.THREAD)
		this.timers.push({expire: Date.now() + delay, thread})
	}

	private buildFrameMap(frames: ResourceTypes.FrameResource[], images: Map<string, AsEngine.ImageData>) {
		const vm = this.vm
		const frameMap: Map<vm_mmid_t, AsEngine.FrameData> = new Map()
		const defaultKey = vm.intern("default")
		for (const frameResource of frames) {
			frameMap.set(vm.intern(frameResource.name), {
				image: images.get(frameResource.image)!,
				left: frameResource.left,
				top: frameResource.top
			})
		}
		if (!frameMap.has(defaultKey)) {
			frameMap.set(defaultKey, frameMap.get(vm.intern(frames[0].name))!)
		}
		return frameMap
	}

	public loadResources(resources: ResourceTypes.Resources) {
		const images: Map<string, AsEngine.ImageData> = new Map()
		for (const imageResource of resources.images){
			const imageData: AsEngine.ImageData = {
				height: imageResource.height,
				width: imageResource.width,
				texture: PIXI.Texture.from(`/images/${imageResource.hash}.png`)
			}
			if (imageResource.hitmap) {
				const data = atob(imageResource.hitmap)
				const hitmap = new Uint8Array(data.length)
				for (let i = 0; i < data.length; i++) {
					hitmap[i] = data.charCodeAt(i)
				}
				imageData.hitmap = hitmap
			}
			images.set(imageResource.hash, imageData)
		}

		const locationMap: Map<vm_mmid_t, AsEngine.LocationData> = new Map()
		const vm = this.vm
		for (const locationResource of resources.locations) {
			const objectMap: Map<vm_mmid_t, AsEngine.ObjectData> = new Map()
			const vmVariable = vm.resolve(locationResource.path)
			if (vmVariable.type != AsVm.Type.LOCATION) {
				throw new Error(`could not resolve location resource ${locationResource.path}: got type '${AsVm.typeLut[vmVariable.type]}', expected 'location'`)
			}
			const locationMmid = vmVariable.value as vm_mmid_t
			for (let i = 0; i < locationResource.objects.length; i++) {
				const objectResource = locationResource.objects[i]
				const vmVariable = vm.resolve(objectResource.name, locationMmid)
				if (vmVariable.type != AsVm.Type.OBJECT) {
					throw new Error(`could not resolve object resource ${locationResource.path}.${objectResource.name}: got type '${AsVm.typeLut[vmVariable.type]}', expected 'object'`)
				}
				objectMap.set(vmVariable.value as vm_mmid_t, {
					zindex: i,
					mmid: vmVariable.value as vm_mmid_t,
					frameMap: this.buildFrameMap(objectResource.frames, images),
				})
			}
			locationMap.set(vmVariable.value as vm_mmid_t, {
				frameMap: this.buildFrameMap(locationResource.frames, images),
				objectMap,
				mmid: locationMmid
			})
		}
		this.locationMap = locationMap
	}

	private updateLocation(updateLocationFrame: boolean) {
		const location = this.location!
		const vm = this.vm
		const heap = vm.$u32

		const container = this.app.stage.getChildAt(0)
		const frameKey = vm.intern("frame")
		const hiddenKey = vm.intern("hidden")
		const defaultKey = vm.intern('default')

		const vmVariable = vm.vStackPush(vm_variable_t.__sizeof) as vm_variable_t

		if (updateLocationFrame) {
			const locationPtr = vm.$._vm_memory_get_ptr(location.mmid) as vm_hashmap_t
			vm.$._vm_hashmap_get(locationPtr, frameKey, vmVariable)
			const frameName = (
				heap[(vmVariable + vm_variable_t.type) / 4] == AsVm.Type.STRING ?
				heap[(vmVariable + vm_variable_t.data) / 4] :
				defaultKey
			)
			const frame = location.frameMap.get(frameName)
			if (!frame) {
				console.log(`frame '${vm.readVmString(frameName)}' not found in location '${vm.getHashmapPath(location.mmid)}'`)
			} else {
				const sprite = container.getChildAt(0) as PIXI.Sprite // tslint:disable-line
				sprite.texture = frame.image.texture
			}
		}

		for (const object of this.updateSet) {
			const sprite = container.getChildAt(object.zindex + 1) as PIXI.Sprite // tslint:disable-line
			const objectPtr = vm.$._vm_memory_get_ptr(object.mmid) as vm_hashmap_t
			vm.$._vm_hashmap_get(objectPtr, hiddenKey, vmVariable)
			if (heap[(vmVariable + vm_variable_t.data) / 4]) {
				sprite.visible = false
			} else {
				sprite.visible = true
				vm.$._vm_hashmap_get(objectPtr, frameKey, vmVariable)
				const frameName = (
					heap[(vmVariable + vm_variable_t.type) / 4] == AsVm.Type.STRING ?
					heap[(vmVariable + vm_variable_t.data) / 4] :
					defaultKey
				)
				const frame = object.frameMap.get(frameName)
				if (!frame) {
					console.log(`frame '${vm.readVmString(frameName)}' not found in object '${vm.getHashmapPath(object.mmid)}'`)
				} else {
					if (sprite.texture != frame.image.texture) {
						sprite.texture = frame.image.texture
						sprite.hitArea = new HitmapRectangle(frame.image)
					}
					sprite.x = frame.left
					sprite.y = frame.top
				}
			}
		}
		vm.vStackPop()
		this.updateSet.clear()
		this.redrawRequest = RedrawRequest.NONE
	}

	private redrawLocation() {
		if (!this.location) {
			throw new Error("no location set")
		}

		const container = new PIXI.Container()
		container.addChild(new PIXI.Sprite(PIXI.Texture.EMPTY))
		for (const object of this.location.objectMap.values()) {
			const sprite = new PIXI.Sprite(PIXI.Texture.EMPTY)
			sprite.visible = false
			sprite.interactive = true
			sprite.on('pointertap', () => this.executeEvent('use', object.mmid))
			container.addChild(sprite)
			this.updateSet.add(object)
		}

		this.app.stage.removeChildren()
		this.app.stage.addChild(container)
		this.updateLocation(true)
	}

	private executeEvent(event: string, object: vm_mmid_t) {
		const vm = this.vm
		const heap = vm.$u32
		const key = vm.intern('__on_' + event)
		const hashmap = vm.$._vm_memory_get_ptr(object) as vm_hashmap_t
		const vmVariable = vm.vStackPush(vm_variable_t.__sizeof) as vm_variable_t
		vm.$._vm_hashmap_get(hashmap, key, vmVariable)
		if (AsVm.isType(heap[(vmVariable + vm_variable_t.type) / 4], AsVm.Type.CALLABLE)) {
			vm.vmCall(heap[(vmVariable + vm_variable_t.data) / 4])
			vm.vmRun()
			this.render()
		}
		vm.vStackPop()
	}
}

namespace AsEngine {
	export interface LocationData {
		mmid: number
		objectMap: Map<vm_mmid_t, ObjectData>
		frameMap: Map<vm_mmid_t, FrameData>
	}

	export interface ObjectData {
		mmid: number
		zindex: number
		frameMap: Map<vm_mmid_t, FrameData>
	}

	export interface FrameData {
		image: ImageData
		top: number
		left: number
	}

	export interface ImageData {
		width: number
		height: number
		texture: PIXI.Texture
		hitmap?: Uint8Array
	}
}

window.addEventListener('load', async () => {
	const app = new PIXI.Application({width: 1366, height: 768})
	document.body.appendChild(app.view)

	const files = await Promise.all([
		axios.get("asvm.wasm", {responseType: 'arraybuffer'}),
		axios.get("test/__output/image.bin", {responseType: 'arraybuffer'}),
		axios.get("resource.json", {responseType: 'json'})
	])

	const vm = await AsVm.create(files[0].data as ArrayBuffer)
	const engine = new AsEngine(vm, app)

	vm.addFunction('__print', (top, argc) => {
		if (argc != 1) {
			vm.$._vm_exception_arity(argc, 1)
			return AsVm.Exception.ARITY
		}
		if (vm.getArgType(top, 1) != AsVm.Type.STRING) {
			vm.$._vm_exception_type(vm.getArgType(top, 1), AsVm.Type.STRING)
			return AsVm.Exception.TYPE
		}
		console.log(vm.readVmString(vm.getArgValue(top, 1) as vm_mmid_t))
		return AsVm.Exception.NONE
	})

	vm.addFunction('__delay', (top, argc) => {
		if (argc != 1) {
			vm.$._vm_exception_arity(argc, 1)
			return AsVm.Exception.ARITY
		}
		if (vm.getArgType(top, 1) != AsVm.Type.INTEGER) {
			vm.$._vm_exception_type(vm.getArgType(top, 1), AsVm.Type.INTEGER)
			return AsVm.Exception.TYPE
		}
		engine.pushThread(vm.$._vm_get_current_thread(), vm.getArgValue(top, 1, true))
		return AsVm.Exception.YIELD
	})

	vm.addFunction('__render', (top, argc) => {
		if (argc == 0) {
			engine.requestRedrawScene()
			return AsVm.Exception.NONE
		} else if (argc == 1) {
			const type = vm.getArgType(top, 1)
			let msg: string | null = null
			if (type == AsVm.Type.LOCATION) {
				msg = engine.requestRedrawLocation(vm.getArgValue(top, 1) as vm_mmid_t)
			} else if (type == AsVm.Type.OBJECT) {
				msg = engine.requestRedrawObject(vm.getArgValue(top, 1) as vm_mmid_t)
			} else {
				vm.$._vm_exception_type(vm.getArgType(top, 1), AsVm.Type.HASHMAP)
				return AsVm.Exception.TYPE
			}
			if (msg) {
				vm.setReturnValue(top, vm.createVmString(msg), AsVm.Type.STRING)
				return AsVm.Exception.USER
			} else {
				return AsVm.Exception.NONE
			}
		} else {
			vm.$._vm_exception_arity(argc, 1)
			return AsVm.Exception.ARITY
		}
	})

	vm.vmInit(new Uint8Array(files[1].data as ArrayBuffer))
	engine.loadResources(files[2].data as ResourceTypes.Resources)
	engine.run()
})
