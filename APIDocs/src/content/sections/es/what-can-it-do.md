El servidor MCP de ITM Platform conecta sus datos de gestión de proyectos con agentes de IA. MCP (Model Context Protocol) es un estándar abierto que permite a las herramientas de IA comunicarse con servicios externos. Una vez conectado, un agente de IA puede consultar su portafolio, analizar datos entre proyectos, tomar acciones e incluso ejecutarse de forma autónoma con una programación -- convirtiendo ITM Platform en infraestructura automatizable.

Funciona con Claude, GitHub Copilot, Cursor, Codex, Windsurf, JetBrains y cualquier otro cliente que soporte MCP. Usted elige la IA; el servidor MCP se encarga del puente con ITM Platform.

### ¿Qué puede hacer un agente?

Desde consultas simples hasta flujos de trabajo automatizados entre sistemas, MCP habilita casos de uso progresivamente más potentes.

#### Consulta rápida

> **Usted:** "¿Qué riesgos están abiertos en mi portafolio?"
>
> El agente agrega los riesgos de todos sus proyectos y destaca los de mayor impacto.

#### Análisis en varios pasos

> **Usted:** "Revise todos los proyectos que terminan este trimestre. Marque los que tengan sobrecostos, riesgos abiertos de alto impacto o avance de tareas por debajo del 60%."
>
> El agente busca sus proyectos, filtra por fecha de fin, y para cada uno obtiene presupuesto, riesgos y tareas. Cruza los datos y entrega un informe priorizado con los proyectos que necesitan atención.

#### Acciones masivas automatizadas

> **Usted:** "Para cada proyecto que siga en estado Planificación con fecha de inicio en el pasado, cambie el estado a Ejecución y cree una tarea de checklist de arranque asignada al director de proyecto."
>
> El agente busca los proyectos que cumplen los criterios, actualiza el estado de cada uno y crea una tarea en cada proyecto. Informa de lo que ha cambiado.

#### Inteligencia programada

> **Cada lunes por la mañana**, un agente obtiene todos los proyectos con tareas vencidas, calcula cuántos días de retraso tiene cada tarea, los agrupa por director de proyecto y publica un resumen en el canal #pmo-alertas de Slack.
>
> Nadie escribe un prompt. El agente se ejecuta según una programación, lee ITM Platform a través de MCP y envía los resultados donde el equipo ya trabaja.

#### Orquestación entre sistemas

> Cuando un desarrollador fusiona un pull request en GitHub, un agente encuentra la tarea correspondiente en ITM Platform por nombre de rama, la marca como completada, actualiza el avance del proyecto y -- si el proyecto acaba de llegar al 100% de tareas completadas -- redacta un resumen de cierre y lo envía al director de programa por correo.
>
> Tres sistemas (GitHub, ITM Platform, correo) orquestados por un solo agente sin intervención humana.
