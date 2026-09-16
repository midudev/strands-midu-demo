// tool() con un schema Zod compartido: RacePrediction es a la vez validación y documentación para el modelo.
import { tool } from '@strands-agents/sdk'

import { savePrediction } from '../../lib/predictions'
import { RacePrediction } from '../schema'

export const saveRacePrediction = tool({
  name: 'save_race_prediction',
  description: 'Guarda la predicción de una carrera para que aparezca en la web. Llámala una vez tengas los datos.',
  inputSchema: RacePrediction,
  callback: (prediction, context) => {
    // invocationState lo comparten hooks y tools durante la invocación: aquí leemos las tools que usó el agente
    const toolsUsadas = (context?.invocationState?.toolsUsadas as string[] | undefined) ?? []

    savePrediction(prediction, toolsUsadas)

    return `Predicción guardada para ${prediction.nombre} (${prediction.distancia}): ${prediction.tiempoEstimado}`
  },
})
