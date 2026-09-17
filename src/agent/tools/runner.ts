// La tool con la que el coach de bienvenida guarda el perfil del corredor. El schema Zod es el contrato: el modelo
// no puede guardar un perfil a medias (la fecha, la distancia o los días por semana en formato incorrecto se rechazan).
import { tool } from '@strands-agents/sdk'

import { saveRunner } from '../../lib/runner'
import { RunnerProfileInput } from '../schema'

export const guardarPerfil = tool({
  name: 'guardar_perfil',
  description:
    'Guarda el perfil del corredor cuando ya sabes su nombre, su carrera objetivo (nombre, fecha y distancia) y cuántos días corre a la semana. ' +
    'Llámala una sola vez, con todo lo que sepas. A partir de aquí el coach, el equipo y la portada se montan con este perfil.',
  inputSchema: RunnerProfileInput,
  callback: (input) => {
    const runner = saveRunner({ ...input, notas: input.notas.map((n) => n.trim()).filter(Boolean) })

    return `Perfil guardado: ${runner.nombre} prepara ${runner.objetivo.carrera} (${runner.objetivo.fecha}). Despídete y no preguntes más.`
  },
})
