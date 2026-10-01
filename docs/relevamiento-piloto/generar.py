"""
Relevamiento para la prueba piloto de SMT EstudIA: un PDF completable por
escuela (se llena desde la compu o se imprime).

Pregunta lo que la plataforma necesita para configurarse y que no tenemos:
datos de la escuela, equipo directivo, el curso del piloto con sus docentes y
horarios, cómo es hoy la libreta (períodos, escala, condiciones de
aprobación, la regla 5/4), asistencia, calendario, comunicación con las
familias, conectividad, normativa y autorizaciones.

    python docs/relevamiento-piloto/generar.py

Requiere reportlab (pip install reportlab). Usa Segoe UI de Windows si está;
si no, Helvetica.
"""

import os
import re
import unicodedata
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..'))
LOGO = os.path.join(RAIZ, 'public', 'Logo_SMT_blanco.png')

# Colores del isologo municipal
AZUL = HexColor('#0166FF')
AZUL_TINTA = HexColor('#062B6B')
CELESTE = HexColor('#2DB0FF')
AMARILLO = HexColor('#F4DC00')
TEXTO = HexColor('#0F172A')
GRIS = HexColor('#475569')
GRIS_CLARO = HexColor('#94A3B8')
BORDE = HexColor('#9FB3CC')
FONDO_CAMPO = HexColor('#F4F8FF')
FONDO_TABLA = HexColor('#EAF3FF')

# Tipografía
try:
    pdfmetrics.registerFont(TTFont('Texto', r'C:\Windows\Fonts\segoeui.ttf'))
    pdfmetrics.registerFont(TTFont('Texto-Negrita', r'C:\Windows\Fonts\segoeuib.ttf'))
    F, FB = 'Texto', 'Texto-Negrita'
except Exception:
    F, FB = 'Helvetica', 'Helvetica-Bold'

ANCHO, ALTO = A4
M = 42                      # margen
W = ANCHO - 2 * M           # ancho útil
ARRIBA = ALTO - 54          # debajo de la franja
ABAJO = 48                  # arriba del pie

E_TEXTO = ParagraphStyle('t', fontName=F, fontSize=9.5, leading=13, textColor=TEXTO)
E_AYUDA = ParagraphStyle('a', fontName=F, fontSize=8, leading=10.5, textColor=GRIS)
E_ETIQ = ParagraphStyle('e', fontName=FB, fontSize=9, leading=11.5, textColor=TEXTO)
E_INTRO = ParagraphStyle('i', fontName=F, fontSize=10, leading=14.5, textColor=TEXTO)


class Formulario:
    def __init__(self, archivo, escuela):
        self.c = canvas.Canvas(archivo, pagesize=A4)
        self.c.setTitle(f'Relevamiento piloto SMT EstudIA - {escuela}')
        self.c.setAuthor('SMT EstudIA - Municipalidad de San Miguel de Tucumán')
        self.escuela = escuela
        self.pagina = 0
        self.campos = set()
        self.nueva_pagina()

    # ── página ──
    def nueva_pagina(self):
        if self.pagina:
            self.pie()
            self.c.showPage()
        self.pagina += 1
        c = self.c
        c.setFillColor(AZUL)
        c.rect(0, ALTO - 36, ANCHO, 36, stroke=0, fill=1)
        c.setFillColor(AMARILLO)
        c.rect(0, ALTO - 38, ANCHO, 2, stroke=0, fill=1)
        if os.path.exists(LOGO):
            c.drawImage(LOGO, M, ALTO - 30, width=59, height=24, mask='auto')
        c.setFillColor(white)
        c.setFont(FB, 9.5)
        c.drawRightString(ANCHO - M, ALTO - 17, 'SMT EstudIA · Relevamiento para la prueba piloto')
        c.setFont(F, 8)
        c.drawRightString(ANCHO - M, ALTO - 28, self.escuela)
        self.y = ARRIBA

    def pie(self):
        c = self.c
        c.setStrokeColor(BORDE)
        c.setLineWidth(0.5)
        c.line(M, 34, ANCHO - M, 34)
        c.setFillColor(GRIS)
        c.setFont(F, 7.5)
        c.drawString(M, 23, 'Municipalidad de San Miguel de Tucumán · Los datos se usan solo para configurar la plataforma de la escuela.')
        c.drawRightString(ANCHO - M, 23, f'Página {self.pagina}')

    def lugar(self, alto):
        if self.y - alto < ABAJO:
            self.nueva_pagina()

    # ── texto ──
    def parrafo(self, texto, estilo=E_TEXTO, ancho=W, x=M, despues=4):
        p = Paragraph(texto, estilo)
        _, h = p.wrap(ancho, 1000)
        self.lugar(h)
        p.drawOn(self.c, x, self.y - h)
        self.y -= h + despues
        return h

    def _alto(self, texto, estilo, ancho):
        return Paragraph(texto, estilo).wrap(ancho, 1000)[1]

    def portada(self, curso, materias):
        c = self.c
        c.setFillColor(AZUL_TINTA)
        c.setFont(FB, 20)
        c.drawString(M, self.y - 22, 'Relevamiento para la prueba piloto')
        self.y -= 32
        c.setFillColor(AZUL)
        c.setFont(FB, 12)
        c.drawString(M, self.y - 12, f'{self.escuela} · {curso}')
        self.y -= 18
        c.setFillColor(GRIS)
        c.setFont(F, 10)
        c.drawString(M, self.y - 10, 'Espacios curriculares: ' + ', '.join(materias))
        self.y -= 24
        self.parrafo(
            'Con estas respuestas configuramos <b>SMT EstudIA</b> para su escuela: las cuentas del equipo, el curso '
            'del piloto, la libreta digital, el calendario y la comunicación con las familias. Se puede completar '
            '<b>desde la computadora</b> (abriendo el PDF y escribiendo en los recuadros) o <b>imprimirlo</b> y '
            'completarlo a mano.', E_INTRO, despues=6)
        self.parrafo(
            'Si una pregunta no aplica o no saben la respuesta, déjenla en blanco: lo charlamos. Los datos ya '
            'cargados (curso, materias y docentes que figuran en el material que nos enviaron) son para '
            '<b>confirmar o corregir</b>.', E_INTRO, despues=10)
        self.fila([('Fecha de envío', 0.33, ''), ('Devolver a', 0.67, '')])
        self.y -= 6

    def seccion(self, numero, titulo, bajada=None):
        alto = 34 + (self._alto(bajada, E_AYUDA, W) + 4 if bajada else 0) + 60
        self.lugar(alto)
        self.y -= 10
        c = self.c
        c.setFillColor(AZUL)
        c.roundRect(M, self.y - 20, 20, 20, 4, stroke=0, fill=1)
        c.setFillColor(white)
        c.setFont(FB, 10.5)
        c.drawCentredString(M + 10, self.y - 14, str(numero))
        c.setFillColor(AZUL_TINTA)
        c.setFont(FB, 13)
        c.drawString(M + 28, self.y - 15, titulo)
        c.setStrokeColor(CELESTE)
        c.setLineWidth(1)
        c.line(M, self.y - 26, ANCHO - M, self.y - 26)
        self.y -= 34
        if bajada:
            self.parrafo(bajada, E_AYUDA, despues=6)

    def subtitulo(self, texto):
        self.lugar(40)
        self.y -= 4
        self.c.setFillColor(AZUL)
        self.c.setFont(FB, 10.5)
        self.c.drawString(M, self.y - 10, texto)
        self.y -= 16

    # ── campos ──
    def _nombre(self, base):
        sin_tildes = unicodedata.normalize('NFKD', base.lower()).encode('ascii', 'ignore').decode()
        n = re.sub(r'[^a-z0-9]+', '_', sin_tildes).strip('_')[:40] or 'campo'
        k, i = n, 2
        while k in self.campos:
            k, i = f'{n}_{i}', i + 1
        self.campos.add(k)
        return k

    def _campo(self, nombre, x, y, ancho, alto, valor='', multilinea=False, ayuda=None):
        self.c.acroForm.textfield(
            name=self._nombre(nombre), tooltip=ayuda or nombre, x=x, y=y, width=ancho, height=alto,
            value=valor, fontName='Helvetica', fontSize=0 if multilinea else 9,
            borderColor=BORDE, fillColor=FONDO_CAMPO, textColor=TEXTO, borderWidth=0.8,
            forceBorder=True, fieldFlags='multiline' if multilinea else '')

    def pregunta(self, etiqueta, ayuda=None, lineas=1, valor=''):
        """Una pregunta con su recuadro. lineas > 1: respuesta larga."""
        alto_campo = 18 if lineas == 1 else 13 * lineas + 6
        alto = self._alto(etiqueta, E_ETIQ, W) + (self._alto(ayuda, E_AYUDA, W) + 2 if ayuda else 0) + alto_campo + 12
        self.lugar(alto)
        self.parrafo(etiqueta, E_ETIQ, despues=2)
        if ayuda:
            self.parrafo(ayuda, E_AYUDA, despues=3)
        self._campo(etiqueta, M, self.y - alto_campo, W, alto_campo, valor, lineas > 1, ayuda)
        self.y -= alto_campo + 9

    def fila(self, items):
        """Varias preguntas cortas en una fila: [(etiqueta, fracción, valor)]."""
        hueco = 10
        anchos = [f * (W - hueco * (len(items) - 1)) for _, f, _ in items]
        alto_et = max(self._alto(e, E_ETIQ, a) for (e, _, _), a in zip(items, anchos))
        self.lugar(alto_et + 30)
        x = M
        for (etiqueta, _, valor), a in zip(items, anchos):
            p = Paragraph(etiqueta, E_ETIQ)
            _, h = p.wrap(a, 100)
            p.drawOn(self.c, x, self.y - h)
            self._campo(etiqueta, x, self.y - alto_et - 20, a, 18, valor)
            x += a + hueco
        self.y -= alto_et + 29

    def opciones(self, etiqueta, opciones, ayuda=None, otro=False, marcadas=()):
        """Casillas para marcar. otro=True suma 'Otro: ____'."""
        c = self.c
        alto = self._alto(etiqueta, E_ETIQ, W) + 40
        self.lugar(alto)
        self.parrafo(etiqueta, E_ETIQ, despues=2)
        if ayuda:
            self.parrafo(ayuda, E_AYUDA, despues=3)
        x, fila = M, self.y - 13
        for op in opciones + (['Otro'] if otro else []):
            ancho = 16 + pdfmetrics.stringWidth(op, F, 9) + 16
            extra = 150 if (otro and op == 'Otro') else 0
            if x + ancho + extra > M + W:
                x, fila = M, fila - 17
                if fila < ABAJO:
                    self.nueva_pagina()
                    fila = self.y - 13
            c.acroForm.checkbox(name=self._nombre(f'{etiqueta} {op}'), tooltip=f'{etiqueta}: {op}',
                                x=x, y=fila - 1, size=10, buttonStyle='check', borderColor=BORDE,
                                fillColor=FONDO_CAMPO, textColor=AZUL, borderWidth=0.8, forceBorder=True,
                                checked=op in marcadas)
            c.setFillColor(TEXTO)
            c.setFont(F, 9)
            c.drawString(x + 14, fila + 1, op)
            x += ancho
            if otro and op == 'Otro':
                self._campo(f'{etiqueta} otro cual', x - 10, fila - 3, 150, 15)
                x += 150
        self.y = fila - 14

    def tabla(self, titulo, columnas, filas, ayuda=None, alto_fila=19):
        """columnas: [(encabezado, fracción)]. filas: lista de listas de valores
        iniciales; un valor que empieza con '§' se muestra fijo (no editable)."""
        c = self.c
        alto_t = (self._alto(titulo, E_ETIQ, W) + 4) if titulo else 0
        alto_a = (self._alto(ayuda, E_AYUDA, W) + 3) if ayuda else 0
        self.lugar(alto_t + alto_a + 20 + alto_fila * min(len(filas), 3))
        if titulo:
            self.parrafo(titulo, E_ETIQ, despues=2)
        if ayuda:
            self.parrafo(ayuda, E_AYUDA, despues=3)
        anchos = [f * W for _, f in columnas]

        def encabezado():
            c.setFillColor(FONDO_TABLA)
            c.rect(M, self.y - 17, W, 17, stroke=0, fill=1)
            x = M
            for (h, _), a in zip(columnas, anchos):
                c.setFillColor(AZUL_TINTA)
                c.setFont(FB, 8)
                c.drawString(x + 4, self.y - 11.5, h)
                x += a
            self.y -= 19

        encabezado()
        for i, fila in enumerate(filas):
            if self.y - alto_fila < ABAJO:
                self.nueva_pagina()
                encabezado()
            x = M
            for j, (valor, a) in enumerate(zip(fila, anchos)):
                if isinstance(valor, str) and valor.startswith('§'):
                    c.setFillColor(TEXTO)
                    c.setFont(FB, 8.5)
                    c.drawString(x + 4, self.y - alto_fila + 6, valor[1:])
                else:
                    self._campo(f'{titulo or "tabla"} {i + 1} {columnas[j][0]}', x + 1, self.y - alto_fila + 1,
                                a - 2, alto_fila - 2, valor or '')
                x += a
            self.y -= alto_fila
        self.y -= 10

    def guardar(self):
        self.pie()
        self.c.save()


def relevamiento(archivo, escuela, curso, materias, docentes, material=None):
    f = Formulario(archivo, escuela)
    f.portada(curso, materias)

    # 1 ─ Escuela
    f.seccion(1, 'Datos de la escuela')
    f.pregunta('Nombre oficial completo', valor=escuela)
    f.fila([('Nombre corto (cómo se la conoce)', 0.5, ''), ('CUE (Código Único de Establecimiento)', 0.5, '')])
    f.fila([('Dirección', 0.6, ''), ('Barrio / zona', 0.4, '')])
    f.fila([('Teléfono', 0.35, ''), ('Email institucional', 0.65, '')])
    f.opciones('Nivel y modalidad', ['Secundario · ciclo básico', 'Secundario · ciclo orientado', 'Técnica', 'Adultos'], otro=True)
    f.pregunta('Orientación u orientaciones del ciclo orientado', ayuda='Ej.: Bachiller en Ciencias Sociales, en Economía y Administración…')
    f.opciones('Turnos', ['Mañana', 'Tarde', 'Vespertino / noche'])
    f.pregunta('Horario de entrada y salida de cada turno')
    f.pregunta('Cursos y divisiones que tiene la escuela', ayuda='Ej.: 1° A, B y C · 2° A y B · … Sirve para dejar la escuela armada en la plataforma aunque el piloto sea en un solo curso.', lineas=3)
    f.fila([('Matrícula total aproximada', 0.5, ''), ('Página web o redes oficiales', 0.5, '')])

    # 2 ─ Equipo
    f.seccion(2, 'Equipo directivo y referentes',
              'El DNI es el usuario con el que van a entrar a la plataforma; el email es opcional (si lo cargan, '
              'pueden entrar también con el email). Cada persona recibe una clave inicial y elige la suya al entrar.')
    f.tabla(None, [('Rol', 0.21), ('Nombre y apellido', 0.29), ('DNI', 0.14), ('Email', 0.22), ('Teléfono', 0.14)],
            [['§Director/a', '', '', '', ''], ['§Vicedirector/a', '', '', '', ''], ['§Secretario/a', '', '', '', ''],
             ['§Coord. pedagógico/a', '', '', '', ''], ['§Preceptor/a del curso', '', '', '', ''],
             ['§Orientación / gabinete', '', '', '', ''], ['§Referente del piloto', '', '', '', '']])
    f.parrafo('<b>Referente del piloto:</b> la persona de la escuela que coordina con nosotros día a día (puede ser alguien de la tabla).', E_AYUDA, despues=6)

    # 3 ─ Curso
    f.seccion(3, f'El curso del piloto: {curso}')
    f.fila([('Curso y división', 0.25, curso), ('Turno', 0.25, ''), ('Cantidad de estudiantes', 0.25, ''), ('Aula', 0.25, '')])
    f.tabla('Docentes del piloto',
            [('Materia', 0.18), ('Nombre y apellido', 0.27), ('DNI', 0.13), ('Email', 0.24), ('Teléfono', 0.18)],
            [[f'§{m}', docentes.get(m, ''), '', '', ''] for m in materias] + [['', '', '', '', '']],
            ayuda='Los nombres precargados salen del material que nos enviaron: confirmen o corrijan. Si un docente da '
                  'más de una materia o trabaja en las dos escuelas del piloto, usa una sola cuenta.')
    f.tabla('Horario semanal de cada materia',
            [('Materia', 0.22), ('Días', 0.30), ('Horario', 0.24), ('Módulos / horas', 0.24)],
            [[f'§{m}', '', '', ''] for m in materias],
            ayuda='Con esto la plataforma le muestra a cada docente "su clase de hoy" y arma la agenda.')
    f.opciones('Nómina de estudiantes (nombre, apellido y DNI): ¿cómo nos la pueden pasar?',
               ['Planilla Excel', 'Foto o PDF de la lista', 'La carga la escuela en la plataforma'],
               ayuda='Los estudiantes entran con su DNI, porque muchos no tienen email. La nómina va aparte de este formulario.')

    # 4 ─ Libreta
    f.seccion(4, 'Libreta y evaluación',
              'Para armar la libreta digital necesitamos saber cómo se califica hoy. Si pueden, adjunten una foto o '
              'escaneo de una libreta en blanco (o con los datos tapados): es lo que más nos sirve.')
    f.opciones('¿Cómo es hoy la libreta?', ['En papel', 'Sistema provincial', 'Planilla propia (Excel)'], otro=True)
    f.pregunta('Si usan un sistema provincial, ¿cuál es? ¿La libreta de la plataforma tendría que reemplazarlo, convivir o solo servir de apoyo?', lineas=2)
    f.opciones('Adjuntamos', ['Modelo de libreta', 'Calendario escolar 2026', 'Régimen de evaluación de la escuela'])

    f.subtitulo('Períodos')
    f.opciones('¿Cómo se divide el año?', ['Trimestres', 'Cuatrimestres', 'Bimestres'], otro=True, marcadas=())
    f.tabla(None, [('Período', 0.22), ('Inicio', 0.26), ('Cierre', 0.26), ('Entrega de libretas', 0.26)],
            [['§1.er período', '', '', ''], ['§2.º período', '', '', ''], ['§3.er período', '', '', ''],
             ['§Período extra', '', '', '']])

    f.subtitulo('Escala y aprobación')
    f.opciones('Escala de calificación', ['Numérica de 1 a 10', 'Con decimales', 'Conceptual (MB, B, R, I…)', 'Mixta'], otro=True)
    f.fila([('Nota mínima para aprobar un período', 0.5, ''), ('Nota mínima para aprobar la materia en el año', 0.5, '')])
    f.pregunta('¿Cómo se obtiene la nota del período?', ayuda='Promedio de las evaluaciones, una ponderación (ej.: pruebas 60 %, trabajos 40 %), concepto del docente… Contanos cómo lo hacen.', lineas=3)
    f.pregunta('¿Cómo se obtiene la nota final del año?', ayuda='Promedio de los períodos, el último período pesa más, otra regla…', lineas=2)
    f.lugar(125)  # la pregunta y su "si es distinto" van en la misma página
    f.opciones('Según lo hablado en la reunión del 26/8: con 5 en un período se avisa a la familia, y con 4 la materia va a diciembre. ¿Es así?',
               ['Sí, es así', 'No, es distinto'])
    f.pregunta('Si es distinto, ¿cómo es?', lineas=2)
    f.opciones('Si no aprueba, ¿qué instancias hay?',
               ['Recuperatorio dentro del período', 'Período de diciembre', 'Período de febrero / marzo', 'Materia previa'], otro=True)
    f.fila([('Fechas aproximadas de diciembre y febrero/marzo', 0.6, ''), ('Materias previas permitidas para pasar de año', 0.4, '')])
    f.opciones('Conducta / convivencia: ¿se califica en la libreta?', ['Sí', 'No'])
    f.pregunta('Si se califica, ¿con qué escala?', ayuda='Hoy la plataforma usa: Muy buena · Buena · Regular · Mala.')
    f.pregunta('¿Se hacen informes escritos o valoraciones cualitativas por estudiante? ¿Cada cuánto y quién los hace?', lineas=2)
    f.opciones('¿Cómo se notifica la libreta a la familia?', ['La firma la familia', 'Cuaderno de comunicaciones', 'WhatsApp', 'Reunión'], otro=True)

    f.subtitulo('Asistencia')
    f.opciones('¿Quién toma asistencia?', ['Preceptor/a, por día', 'Cada docente, por materia', 'Ambos'])
    f.fila([('Máximo de inasistencias o % mínimo de asistencia', 0.5, ''), ('¿Cuánto vale una llegada tarde?', 0.5, '')])
    f.pregunta('¿Qué pasa al superar el máximo? ¿Cómo se justifican las inasistencias?', lineas=2)

    f.subtitulo('Calendario')
    f.tabla('Evaluaciones ya previstas en las materias del piloto',
            [('Fecha', 0.18), ('Materia', 0.24), ('Tipo (prueba, TP, oral…)', 0.28), ('Tema', 0.30)],
            [['', '', '', ''] for _ in range(6)])
    f.pregunta('Otras fechas importantes', ayuda='Recesos, jornadas institucionales, actos, reuniones de familias, cierre de notas…', lineas=3)

    # 5 ─ Familias
    f.seccion(5, 'Comunicación con las familias')
    f.opciones('¿Por dónde se comunican hoy con las familias?', ['Cuaderno de comunicaciones', 'WhatsApp', 'Email', 'Reuniones'], otro=True)
    f.fila([('% aproximado de familias con celular y WhatsApp', 0.5, ''), ('% aproximado de familias con email', 0.5, '')])
    f.pregunta('¿Quién suele ser el contacto de cada estudiante? ¿Hay estudiantes con más de un adulto responsable o que viven con otros familiares?', lineas=2)

    # 6 ─ Conectividad
    f.seccion(6, 'Conectividad y dispositivos', 'La plataforma funciona sin conexión y en celulares con pocos datos; con esto ajustamos cómo usarla en el aula.')
    f.opciones('Wifi en la escuela', ['En toda la escuela', 'Solo en algunos lugares', 'No hay'])
    f.opciones('¿Los estudiantes pueden usar el wifi?', ['Sí', 'No', 'Solo con permiso'])
    f.opciones('Calidad de la conexión', ['Buena', 'Regular', 'Mala'])
    f.fila([('% aprox. de estudiantes del curso con celular propio', 0.5, ''), ('% aprox. con datos móviles', 0.5, '')])
    f.opciones('En el aula del piloto hay', ['Proyector', 'Televisor', 'Pizarra digital', 'Parlantes', 'Nada de esto'])
    f.opciones('Computadoras', ['Sala de informática', 'Netbooks / carro móvil', 'Para docentes', 'No hay'])
    f.pregunta('¿Se permite el uso del celular en clase? ¿Con qué reglas?', lineas=2)

    # 7 ─ Normativa
    f.seccion(7, 'Normativa, bienestar y autorizaciones')
    f.opciones('Documentos que pueden compartir (la plataforma tiene una sección de normativa para el equipo)',
               ['Acuerdos escolares de convivencia', 'Reglamento interno', 'Protocolos (ESI, violencia, consumo…)'], otro=True)
    f.pregunta('La plataforma avisa cuando un estudiante muestra señales de malestar emocional. ¿A quién tienen que llegar esos avisos?',
               ayuda='Ej.: preceptor/a, gabinete u orientación, dirección. Nombre y rol.', lineas=2)
    f.opciones('¿Hace falta una autorización de las familias para que los estudiantes usen la plataforma?', ['Sí', 'No', 'No sabemos'])
    f.pregunta('Si hace falta, ¿hay un modelo o lo armamos? ¿Quién lo gestiona?', lineas=2)

    # 8 ─ Material (solo si ya revisamos lo que mandó la escuela)
    n = 8
    if material:
        f.seccion(n, 'Sobre el material que nos enviaron',
                  'Revisamos los programas y el material del Drive. Estas preguntas son para terminar de cargarlo bien: '
                  'varias son para cada docente. Si es más fácil, las charlamos en persona.')
        for tema, preguntas in material:
            f.subtitulo(tema)
            for q in preguntas:
                f.pregunta(q, lineas=2)
        n += 1

    # Arranque: va entero en una página (si no, la firma queda sola en la última)
    f.lugar(280)
    f.seccion(n, 'Arranque')
    f.pregunta('Días y horarios posibles para una capacitación con docentes y directivos (presencial o virtual)', lineas=2)
    f.fila([('Fecha en que les gustaría empezar con los estudiantes', 0.6, ''), ('¿Capacitación presencial o virtual?', 0.4, '')])
    f.pregunta('¿Qué les gustaría que la plataforma resuelva, o qué les preocupa?', lineas=4)
    f.fila([('Completó (nombre y cargo)', 0.65, ''), ('Fecha', 0.35, '')])

    f.guardar()


if __name__ == '__main__':
    salida = os.path.join(AQUI)
    # Preguntas que salen de revisar el material de la Storni (supabase/contenido/storni-2a.json)
    material_storni = [
        ('Docentes', [
            'Lengua: ¿quién dicta Lengua en 2° A? No figura en ningún documento.',
            'Matemática: en el material hay dos programas de 2° año, uno de Giuliana González (2° "A") y otro de Fátima Natalia Villagra (sin división). ¿Cuál vale para 2° A? ¿El de Villagra es de otra división?',
            'Físico-Química: la planificación es de 2° A y B y nombra a María Eugenia Jiménez y a María Gabriela Nieto. ¿Las dos dan clase en 2° A, o Nieto es la docente de 2° B?',
        ]),
        ('Calendario y trimestres', [
            '¿Cuáles son las fechas oficiales de los tres trimestres 2026? Físico-Química usa 05/03–30/05, 02/06–05/09 y 08/09–05/12; Matemática pone el 3° del 07/09 al 04/12.',
            'Matemática: ¿el Eje 1 (números enteros) va en el 1.er trimestre y el Eje 2 (ángulos) en el 2.º? ¿En qué trimestre se dio "Sistema sexagesimal"? "Ecuaciones de primer grado" aparece en los tres ejes: ¿se trabaja todo el año?',
            'Lengua: ¿en qué trimestre va cada unidad? La secuencia "Persuasión y Palabra Poética", ¿se está dando ahora, en el 3.er trimestre?',
            'Físico-Química: en el 2.º trimestre, ¿en qué orden se dieron "Soluciones" y "Cambios físicos y químicos"? Los objetivos de fuerzas que aparecen en el 3.er trimestre, ¿son un error de copia del 1.º?',
            'El 1.º y el 2.º trimestre ya terminaron. ¿Quieren que sus unidades se vean igual en el temario de estudiantes y familias, como historial, o solo las del 3.º?',
        ]),
        ('Documentos que faltan o llegaron cortados', [
            'Matemática: falta la primera hoja de la planificación de González (títulos de columnas, 1.er trimestre / Eje 1) y la columna de evaluación sale cortada en el escaneo. ¿Nos la pueden mandar?',
            'Lengua: de la planificación anual solo llegó el programa de contenidos (sin encabezado) y el final de la tabla de la Unidad 3. ¿Nos mandan la planificación completa? ¿Las unidades tienen nombre?',
            '¿Hay clases, apuntes o trabajos prácticos para lo que todavía no tiene material? Matemática: Eje 1 y Eje 3 (en curso). Físico-Química: "Magnitudes y fuerzas", "Soluciones" y partículas subatómicas. Lengua: Unidades 1 y 2, y en la Unidad 3 textos instructivos, complemento régimen y ortografía.',
        ]),
        ('Criterios de evaluación', [
            '¿Qué criterios de evaluación quieren que vean estudiantes y familias en cada trimestre y materia? Matemática y Físico-Química traen instrumentos (evaluaciones, trabajos prácticos, carpeta, participación); Lengua no trae. Si tienen criterios de logro o ponderaciones, nos sirven.',
        ]),
        ('Revisión de contenido (para cada docente)', [
            'Matemática (Sistema sexagesimal): ¿confirman las correcciones 10′ → 10″ en la suma y 06′ → 06″ en la división, y que "4. γ" es 4 por γ? ¿Tienen las respuestas de la actividad?',
            'Físico-Química (apunte): ¿"gases nobles o formales" quiso decir "inertes"? ¿"composición física" quiso decir "química"? ¿A es el número másico (entero) o la masa atómica (55,847)? ¿Qué dato va en la fila vacía del cuadro? El ítem g) repite "Congelar agua": ¿iba otra situación? ¿Cómo se obtiene la columna de electrones?',
            'Físico-Química (apunte): ¿pueden revisar la historia de la tabla periódica (Moseley en 1910, Werner después de Moseley, "doscientos años atrás") y lo de los 8 electrones de valencia? La plataforma arma resúmenes y preguntas con IA a partir del apunte, y repetiría un error.',
            'Lengua (Persuasión y Palabra Poética): ¿la escribió la docente y la aprueba como está, con las actividades con IA? En la Clase 4 se piden comparaciones en "Gato negro": ¿cuáles esperan que encuentren, o la consigna era sobre "Poema X"? En la Clase 3 se piden imágenes sensoriales antes de verlas en la Clase 4: ¿está bien así?',
            'Lengua: las consignas dicen que el estudiante usa "la IA en la plataforma" y un "mural digital". ¿Con qué herramientas lo piensan hacer?',
        ]),
        ('Biblioteca y derechos de autor', [
            '¿Podemos compartir con los estudiantes los apuntes propios de las docentes (Sistema sexagesimal y el de Físico-Química), para que la plataforma arme resumen, placas de estudio, preguntas de práctica y podcast?',
            'Lengua: ¿de qué libro son las páginas escaneadas (título, editorial, año)? ¿Los estudiantes lo tienen? En vez de subir el escaneo, ¿les parece que carguemos un resumen con la referencia al libro? Los poemas de autores con derechos vigentes (Neruda, María Cristina Ramos) no se pueden reproducir completos.',
            'Físico-Química: ¿de dónde salen las figuras (casillero del hierro y esquema de la tabla) y la historia de la tabla periódica del apunte?',
            'Bibliografía: ¿nos confirman el título y la edición del libro de Juan Pablo Pisano (Logikamente), el número de "Lengua y Literatura" (está corregido a mano), la editorial "Tinta Fresca" (se lee borroso) y el año del libro de Santillana?',
        ]),
    ]

    piloto = [
        ('Relevamiento piloto - E.M. Gabriela Mistral.pdf', 'Escuela Municipal Gabriela Mistral Secundaria', '3° A',
         {'Matemática': 'Nehemías Francisco Martínez'}),
        ('Relevamiento piloto - E.M. Alfonsina Storni.pdf', 'Escuela Municipal Alfonsina Storni Secundaria', '2° A',
         {'Matemática': 'Giuliana González', 'Físico-Química': 'María Eugenia Jiménez'}),
    ]
    for archivo, escuela, curso, docentes in piloto:
        ruta = os.path.join(salida, archivo)
        material = material_storni if 'Storni' in escuela else None
        relevamiento(ruta, escuela, curso, ['Matemática', 'Físico-Química', 'Lengua'], docentes, material)
        print('ok', ruta)
