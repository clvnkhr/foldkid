import { Mesh, PlaneGeometry, type BufferGeometry, type Material } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { makeBubble3dEnvironment } from './bubbles3dAppearance'

describe('3D bubble environment', () => {
  it('disposes every generated geometry and material once, including geometry shared by light panels', () => {
    const room = makeBubble3dEnvironment()
    const resources = new Set<BufferGeometry | Material>()
    const panelGeometries: BufferGeometry[] = []
    room.traverse(object => {
      if (!(object instanceof Mesh)) return
      resources.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material)
      if (object.geometry instanceof PlaneGeometry) panelGeometries.push(object.geometry)
    })
    const disposals = [...resources].map(resource => {
      const listener = vi.fn()
      resource.addEventListener('dispose', listener)
      return { resource, listener }
    })
    let disposed = false
    try {
      expect(panelGeometries.length).toBeGreaterThan(1)
      expect(new Set(panelGeometries).size).toBe(1)
      room.dispose()
      disposed = true
      for (const { listener } of disposals) expect(listener).toHaveBeenCalledOnce()
    } finally {
      if (!disposed) room.dispose()
      for (const { resource, listener } of disposals) resource.removeEventListener('dispose', listener)
    }
  })
})
