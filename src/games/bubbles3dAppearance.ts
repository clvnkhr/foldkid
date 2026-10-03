import { Color, Mesh, MeshLambertMaterial, MeshPhysicalMaterial, MeshStandardMaterial, PlaneGeometry } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

export const makeBubble3dMaterial = (color: string): MeshPhysicalMaterial => new MeshPhysicalMaterial({
  color: new Color(color).lerp(new Color('#ffffff'), 0.06),
  metalness: 0,
  roughness: 0.075,
  clearcoat: 1,
  clearcoatRoughness: 0.025,
  transmission: 0.35,
  ior: 1.35,
  thickness: 0.8,
  attenuationColor: color,
  attenuationDistance: 2.5,
  iridescence: 0.35,
  iridescenceIOR: 1.25,
  iridescenceThicknessRange: [100, 320],
  envMapIntensity: 1.3,
})

export const makeBubble3dEnvironment = (): RoomEnvironment => {
  const room = new RoomEnvironment()
  room.traverse(object => {
    if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) object.material.color.set('#202539')
  })
  const geometry = new PlaneGeometry()
  const panel = (position: readonly [number, number, number], width: number, height: number, color: string, intensity: number): void => {
    const material = new MeshLambertMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity })
    const mesh = new Mesh(geometry, material)
    mesh.position.set(...position)
    mesh.scale.set(width, height, 1)
    room.add(mesh)
    mesh.lookAt(0, 0, 0)
  }
  // Nearby softboxes make broad highlights and narrow glints slide across the curved surfaces.
  panel([-4, 6, 6], 3.8, 5.4, '#fff5e7', 8)
  panel([5, 3.8, 2], 1.1, 7, '#dcecff', 10)
  panel([1, 2.5, 8], 2, 1, '#ffffff', 12)
  return room
}
