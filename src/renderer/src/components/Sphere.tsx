import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useMemo } from 'react'
import * as THREE from 'three'
import { eliService } from '@renderer/services/Eli-voice-ai'

const CustomParticleSphere = ({ count = 3000 }) => {
  const mesh = useRef<THREE.Points>(null)
  const particleTickRef = useRef(0)
  const { invalidate } = useThree()

  const dataArray = useMemo(() => new Uint8Array(128), [])
  const colorA = useMemo(() => new THREE.Color('#33db12'), [])
  const colorB = useMemo(() => new THREE.Color('#ffffff'), [])
  const tempColor = useMemo(() => new THREE.Color(), [])

  const { positions, originalPositions, spreadFactors } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const orig = new Float32Array(count * 3)
    const spread = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const x = Math.random() * 2 - 1
      const y = Math.random() * 2 - 1
      const z = Math.random() * 2 - 1

      const vector = new THREE.Vector3(x, y, z)
      vector.normalize().multiplyScalar(2)

      pos[i * 3] = vector.x
      pos[i * 3 + 1] = vector.y
      pos[i * 3 + 2] = vector.z

      orig[i * 3] = vector.x
      orig[i * 3 + 1] = vector.y
      orig[i * 3 + 2] = vector.z

      spread[i] = Math.random()
    }
    return { positions: pos, originalPositions: orig, spreadFactors: spread }
  }, [count])

  useFrame((state, delta) => {
    if (!state.clock.running || !mesh.current) return

    mesh.current.rotation.y += delta * 0.05
    mesh.current.rotation.z += delta * 0.05

    let volume = 0
    if (eliService.analyser) {
      eliService.analyser.getByteFrequencyData(dataArray)
      const avg = dataArray.reduce((a, b) => a + b) / dataArray.length
      volume = avg / 128
    }

    tempColor.copy(colorA).lerp(colorB, volume)
    ;(mesh.current.material as THREE.PointsMaterial).color.copy(tempColor)

    particleTickRef.current += delta
    if (particleTickRef.current < 1 / 30) return
    particleTickRef.current = 0

    const currentPos = mesh.current.geometry.attributes.position.array as Float32Array

    for (let i = 0; i < count; i++) {
      const ix = i * 3 
      const iy = i * 3 + 1
      const iz = i * 3 + 2 

      const expansion = 1 + volume * spreadFactors[i] * 0.40

      currentPos[ix] = originalPositions[ix] * expansion
      currentPos[iy] = originalPositions[iy] * expansion
      currentPos[iz] = originalPositions[iz] * expansion
    }

    mesh.current.geometry.attributes.position.needsUpdate = true
  })

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    let disposed = false

    const poll = () => {
      if (disposed) return
      let avg = 0
      if (eliService.analyser) {
        eliService.analyser.getByteFrequencyData(dataArray)
        avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
      }

      invalidate()
      if (timer) clearInterval(timer)
      timer = setInterval(poll, avg > 3 ? 33 : 200)
    }

    timer = setInterval(poll, 200)
    return () => {
      disposed = true
      if (timer) clearInterval(timer)
    }
  }, [dataArray, invalidate])

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          name="position"
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#00F0FF"
        size={0.011}
        transparent={true}
        opacity={0.9}
        sizeAttenuation={true}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

const Sphere = () => {
  return (
    <Canvas camera={{ position: [0, 0, 4.5] }} dpr={[1, 1.5]} frameloop="demand">
      <ambientLight intensity={0.6} />
      <CustomParticleSphere />
    </Canvas>
  )
}

export default Sphere
