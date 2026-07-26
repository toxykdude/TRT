'use client';

import Particles, {
  ParticlesProvider,
  type IParticlesProps,
  type ParticlesPluginRegistrar,
} from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

const registerSlimParticles: ParticlesPluginRegistrar = async (engine) => {
  await loadSlim(engine);
};

type SparklesProps = {
  className?: string;
  color?: string;
  density?: number;
  speed?: number;
};

export function Sparkles({
  className,
  color = '#00E6A1',
  density = 48,
  speed = 0.35,
}: SparklesProps) {
  const shouldReduceMotion = useReducedMotion();
  const options: NonNullable<IParticlesProps['options']> = {
    fullScreen: { enable: false },
    background: { color: { value: 'transparent' } },
    detectRetina: true,
    fpsLimit: 45,
    motion: {
      disable: Boolean(shouldReduceMotion),
      reduce: { factor: 4, value: true },
    },
    particles: {
      color: { value: color },
      links: { enable: false },
      move: {
        enable: !shouldReduceMotion,
        random: true,
        speed,
        straight: false,
        outModes: { default: 'out' },
      },
      number: {
        density: { enable: true },
        value: density,
      },
      opacity: {
        value: { min: 0.12, max: 0.55 },
        animation: {
          enable: !shouldReduceMotion,
          speed: 0.45,
          sync: false,
        },
      },
      shape: { type: 'circle' },
      size: {
        value: { min: 0.6, max: 2.2 },
        animation: {
          enable: !shouldReduceMotion,
          speed: 1,
          sync: false,
        },
      },
    },
  };

  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0', className)}>
      <ParticlesProvider init={registerSlimParticles}>
        <Particles
          id="pricing-sparkles"
          options={options}
          className="h-full w-full"
          style={{ height: '100%', width: '100%' }}
        />
      </ParticlesProvider>
    </div>
  );
}
