import { jsPDF } from 'jspdf';
import { getSueldoBase, formatCLP, SALARY_YEAR } from '@/constants/salaryTable';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d) {
  if (!d) return '___________';
  const dt = typeof d === 'string' ? new Date(d + 'T12:00:00') : d;
  return dt.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateShort(d) {
  if (!d) return '___';
  const dt = typeof d === 'string' ? new Date(d + 'T12:00:00') : d;
  return dt.toLocaleDateString('es-CL');
}

function numberToOrdinal(n) {
  const ordinals = {
    1:'primero',2:'segundo',3:'tercero',4:'cuarto',5:'quinto',
    6:'sexto',7:'séptimo',8:'octavo',9:'noveno',10:'décimo',
    11:'undécimo',12:'duodécimo',13:'decimotercero',14:'decimocuarto',15:'decimoquinto',
  };
  return ordinals[n] || String(n);
}

const CATEGORY_NAMES = {
  A: 'Médico/Dentista',
  B: 'Profesional',
  C: 'Técnico',
  D: 'Tecnólogo',
  E: 'Administrativo',
  F: 'Auxiliar',
};

// ─── PDF Builder ──────────────────────────────────────────────────────────────

class ResolutionPDFBuilder {
  constructor() {
    this.doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    this.margin = 25;
    this.y = this.margin;
    this.pageW = 215.9;
    this.contentW = this.pageW - this.margin * 2;
    this.doc.setFont('helvetica');
  }

  get maxY() { return 279.4 - this.margin; }

  newPageIfNeeded(needed = 12) {
    if (this.y + needed > this.maxY) {
      this.doc.addPage();
      this.y = this.margin;
    }
  }

  line(color = '#cccccc') {
    this.doc.setDrawColor(color);
    this.doc.setLineWidth(0.3);
    this.doc.line(this.margin, this.y, this.pageW - this.margin, this.y);
    this.y += 4;
  }

  text(str, opts = {}) {
    const {
      size = 10, bold = false, italic = false, center = false,
      color = '#1a1a2e', indent = 0, leading = 6,
    } = opts;

    this.newPageIfNeeded(leading + 2);
    this.doc.setFontSize(size);
    this.doc.setTextColor(color);
    const style = bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
    this.doc.setFont('helvetica', style);
    const x = center ? this.pageW / 2 : this.margin + indent;
    const align = center ? 'center' : 'left';
    const maxW = this.contentW - indent;
    const lines = this.doc.splitTextToSize(str, maxW);
    this.doc.text(lines, x, this.y, { align });
    this.y += leading * lines.length;
  }

  paragraph(label, value, opts = {}) {
    this.newPageIfNeeded(14);
    this.doc.setFontSize(opts.size || 10);
    this.doc.setTextColor('#555577');
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(label + ': ', this.margin + (opts.indent || 0), this.y);
    const lw = this.doc.getTextWidth(label + ': ');
    this.doc.setTextColor('#1a1a2e');
    this.doc.setFont('helvetica', 'normal');
    const lines = this.doc.splitTextToSize(value || '—', this.contentW - lw - (opts.indent || 0));
    this.doc.text(lines, this.margin + (opts.indent || 0) + lw, this.y);
    this.y += 6 * lines.length;
  }

  considerando(num, text) {
    this.newPageIfNeeded(16);
    const label = `${num}°`;
    this.doc.setFontSize(10);
    this.doc.setTextColor('#555577');
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(label, this.margin, this.y);
    this.doc.setTextColor('#1a1a2e');
    this.doc.setFont('helvetica', 'normal');
    const lines = this.doc.splitTextToSize(text, this.contentW - 8);
    this.doc.text(lines, this.margin + 8, this.y);
    this.y += 6 * lines.length + 2;
  }

  resuelve(num, text) {
    this.newPageIfNeeded(16);
    this.doc.setFontSize(10);
    this.doc.setTextColor('#1a3a6e');
    this.doc.setFont('helvetica', 'bold');
    const prefix = `${num}.- `;
    this.doc.text(prefix, this.margin, this.y);
    const pw = this.doc.getTextWidth(prefix);
    this.doc.setTextColor('#1a1a2e');
    this.doc.setFont('helvetica', 'normal');
    const lines = this.doc.splitTextToSize(text, this.contentW - pw);
    this.doc.text(lines, this.margin + pw, this.y);
    this.y += 6 * lines.length + 2;
  }

  header(resNum, date, institution = 'APS Panguipulli') {
    // Logo placeholder / Header box
    this.doc.setFillColor('#1a3a6e');
    this.doc.rect(this.margin, this.y, this.contentW, 14, 'F');
    this.doc.setFontSize(12);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor('#ffffff');
    this.doc.text(institution.toUpperCase(), this.pageW / 2, this.y + 5, { align: 'center' });
    this.doc.setFontSize(9);
    this.doc.setFont('helvetica', 'normal');
    this.doc.text('DEPARTAMENTO DE RECURSOS HUMANOS', this.pageW / 2, this.y + 10, { align: 'center' });
    this.y += 18;

    // Title
    this.doc.setFontSize(13);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor('#1a3a6e');
    this.doc.text(`RESOLUCIÓN EXENTA N° ${resNum}`, this.pageW / 2, this.y, { align: 'center' });
    this.y += 7;
    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor('#555577');
    this.doc.text(`Panguipulli, ${formatDate(date)}`, this.pageW / 2, this.y, { align: 'center' });
    this.y += 10;
    this.line('#1a3a6e');
  }

  signaturesBlock(date) {
    this.y += 16;
    this.newPageIfNeeded(40);
    this.line();
    this.y += 4;
    const col1 = this.margin + this.contentW * 0.15;
    const col2 = this.margin + this.contentW * 0.65;
    const lineLen = 55;

    this.doc.setDrawColor('#888888');
    this.doc.setLineWidth(0.3);
    this.doc.line(col1, this.y, col1 + lineLen, this.y);
    this.doc.line(col2, this.y, col2 + lineLen, this.y);
    this.y += 4;

    this.doc.setFontSize(9);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor('#333333');
    this.doc.text('DIRECTOR(A) APS PANGUIPULLI', col1 + lineLen / 2, this.y, { align: 'center' });
    this.doc.text('JEFE(A) DE PERSONAL', col2 + lineLen / 2, this.y, { align: 'center' });
    this.y += 5;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor('#888888');
    this.doc.text('Firma y Timbre', col1 + lineLen / 2, this.y, { align: 'center' });
    this.doc.text('Firma y Timbre', col2 + lineLen / 2, this.y, { align: 'center' });
    this.y += 10;

    this.doc.setFontSize(7);
    this.doc.setTextColor('#aaaaaa');
    this.doc.text(
      `Documento generado por Sistema de Carrera Funcionaria · ${new Date().toLocaleString('es-CL')}`,
      this.pageW / 2, this.y, { align: 'center' }
    );
    this.y += 4;
    this.doc.text('Ley 19.378 — Estatuto de Atención Primaria de Salud Municipal', this.pageW / 2, this.y, { align: 'center' });
  }

  save(filename) {
    this.doc.save(filename);
  }
}

// ─── PLANTILLAS ───────────────────────────────────────────────────────────────

export function generarResolucionCambioNivel({ resolution, employee }) {
  const b = new ResolutionPDFBuilder();
  const { resolution_number, resolution_date, previous_level, new_level, description } = resolution;
  const cat = employee.category;
  const sbAnterior = getSueldoBase(cat, previous_level);
  const sbNuevo = getSueldoBase(cat, new_level);
  const diferencial = sbAnterior != null && sbNuevo != null ? Math.abs(sbNuevo - sbAnterior) : null;

  b.header(resolution_number, resolution_date);
  b.text('CAMBIO DE NIVEL EN ESCALAFÓN DE CARRERA FUNCIONARIA', { size: 11, bold: true, center: true, color: '#1a3a6e', leading: 8 });
  b.y += 4;
  b.line();

  b.text('VISTOS:', { size: 10, bold: true, color: '#1a3a6e' });
  b.y += 2;
  b.text(
    `Lo dispuesto en la Ley N° 19.378 que establece el Estatuto de Atención Primaria de Salud Municipal; el Decreto Supremo N° 1.889/1995 del Ministerio de Salud; la Ley N° 18.883 sobre Estatuto Administrativo para Funcionarios Municipales en lo que corresponda; la solicitud de cambio de nivel formulada para el/la funcionario/a ${employee.full_name}; y lo resuelto mediante acto administrativo de esta Dirección.`,
    { size: 9.5, color: '#333333', leading: 5.5 }
  );
  b.y += 4;

  b.text('CONSIDERANDO:', { size: 10, bold: true, color: '#1a3a6e' });
  b.y += 2;
  b.considerando(1, `Que, el/la funcionario/a ${employee.full_name}, RUT ${employee.rut}, pertenece a la Categoría ${cat} (${CATEGORY_NAMES[cat] || ''}) del Escalafón de Carrera Funcionaria de la APS Panguipulli, con cargo de ${employee.position || 'No especificado'} en ${employee.department || 'No especificado'}.`);
  b.considerando(2, `Que, el/la funcionario/a ha cumplido con los requisitos establecidos en el artículo 36 y siguientes de la Ley N° 19.378 para acceder al nivel ${numberToOrdinal(new_level)} (${new_level}) del escalafón, habiendo alcanzado el puntaje de carrera necesario para este avance.`);
  b.considerando(3, `Que, la Unidad de Recursos Humanos ha verificado el cumplimiento de los requisitos de experiencia y capacitación exigidos para este cambio de nivel, según lo estipulado en la normativa vigente.`);
  if (description) b.considerando(4, description);
  b.y += 4;

  b.text('RESUELVO:', { size: 10, bold: true, color: '#1a3a6e' });
  b.y += 2;
  b.resuelve(1, `RECONÓCESE el cambio de nivel en el Escalafón de Carrera Funcionaria del/la funcionario/a ${employee.full_name}, RUT ${employee.rut}, desde el nivel ${previous_level} (${numberToOrdinal(previous_level)}) al nivel ${new_level} (${numberToOrdinal(new_level)}) de la Categoría ${cat}, a contar de la fecha de la presente resolución.`);
  if (sbNuevo != null) {
    b.resuelve(2, `FÍJASE el nuevo sueldo base mensual del/la funcionario/a en ${formatCLP(sbNuevo)}, equivalente al nivel ${new_level} de la Categoría ${cat} según tabla salarial vigente ${SALARY_YEAR}${diferencial != null ? `, implicando un incremento mensual bruto de ${formatCLP(diferencial)}` : ''}.`);
  }
  b.resuelve(3, 'NOTIFÍQUESE la presente resolución al/la funcionario/a afectado/a y al Departamento de Contabilidad para los efectos presupuestarios que correspondan.');
  b.resuelve(4, 'REMÍTASE copia a la hoja de vida del/la funcionario/a y al registro de carrera funcionaria.');
  b.resuelve(5, 'ANÓTESE, COMUNÍQUESE Y ARCHÍVESE.');

  b.signaturesBlock(resolution_date);
  b.save(`ResolucionCambioNivel_${employee.rut}_N${resolution_number}.pdf`);
}

export function generarResolucionBienio({ resolution, employee }) {
  const b = new ResolutionPDFBuilder();
  const { resolution_number, resolution_date, description } = resolution;
  const bieniosNuevo = (employee.bienios_count || 0);

  b.header(resolution_number, resolution_date);
  b.text('RECONOCIMIENTO DE BIENIO — CARRERA FUNCIONARIA', { size: 11, bold: true, center: true, color: '#1a3a6e', leading: 8 });
  b.y += 4;
  b.line();

  b.text('VISTOS:', { size: 10, bold: true, color: '#1a3a6e' });
  b.y += 2;
  b.text(
    `Lo dispuesto en los artículos 34 y 35 de la Ley N° 19.378 sobre reconocimiento de experiencia laboral; el Decreto Supremo N° 1.889/1995 del MINSAL; los antecedentes de servicio del/la funcionario/a y el informe de la Unidad de Recursos Humanos.`,
    { size: 9.5, color: '#333333', leading: 5.5 }
  );
  b.y += 4;

  b.text('CONSIDERANDO:', { size: 10, bold: true, color: '#1a3a6e' });
  b.y += 2;
  b.considerando(1, `Que, el/la funcionario/a ${employee.full_name}, RUT ${employee.rut}, presta servicios en la APS Panguipulli en el cargo de ${employee.position || 'No especificado'} de la Categoría ${employee.category}.`);
  b.considerando(2, `Que, de acuerdo a la revisión de sus periodos de servicio y los antecedentes adjuntos, el/la funcionario/a ha completado dos (2) años continuos de servicios computables, cumpliendo con las exigencias legales para el reconocimiento de un nuevo bienio.`);
  b.considerando(3, `Que, el total de bienios reconocidos al/la funcionario/a, incluyendo el presente, asciende a ${bieniosNuevo} bienio(s), generando los efectos en el puntaje de carrera funcionaria establecidos en la Ley N° 19.378.`);
  if (description) b.considerando(4, description);
  b.y += 4;

  b.text('RESUELVO:', { size: 10, bold: true, color: '#1a3a6e' });
  b.y += 2;
  b.resuelve(1, `RECONÓCESE el bienio N° ${bieniosNuevo} al/la funcionario/a ${employee.full_name}, RUT ${employee.rut}, a partir del ${formatDate(resolution_date)}, de conformidad con lo dispuesto en el artículo 34 de la Ley N° 19.378.`);
  b.resuelve(2, `REGÍSTRASE en la hoja de vida del/la funcionario/a el presente reconocimiento de bienio, actualizando el puntaje de carrera según corresponda.`);
  b.resuelve(3, 'NOTIFÍQUESE al/la funcionario/a y a la Unidad de Contabilidad para los efectos presupuestarios que correspondan.');
  b.resuelve(4, 'ANÓTESE, COMUNÍQUESE Y ARCHÍVESE.');

  b.signaturesBlock(resolution_date);
  b.save(`ResolucionBienio_${employee.rut}_N${resolution_number}.pdf`);
}

export function generarResolucionContrato({ resolution, employee }) {
  const b = new ResolutionPDFBuilder();
  const { resolution_number, resolution_date, description } = resolution;
  const sb = getSueldoBase(employee.category, employee.current_level);

  b.header(resolution_number, resolution_date);
  b.text('NOMBRAMIENTO / CONTRATO DE FUNCIONARIO', { size: 11, bold: true, center: true, color: '#1a3a6e', leading: 8 });
  b.y += 4;
  b.line();

  b.text('VISTOS:', { size: 10, bold: true, color: '#1a3a6e' });
  b.y += 2;
  b.text(
    `La Ley N° 19.378 Estatuto de Atención Primaria de Salud Municipal; la Ley N° 18.883 Estatuto Administrativo para Funcionarios Municipales; la Ley N° 20.922 que modifica disposiciones aplicables a los funcionarios municipales; el presupuesto municipal vigente; y los antecedentes que obran en poder de esta Dirección.`,
    { size: 9.5, color: '#333333', leading: 5.5 }
  );
  b.y += 4;

  b.text('CONSIDERANDO:', { size: 10, bold: true, color: '#1a3a6e' });
  b.y += 2;
  b.considerando(1, `Que, existe la necesidad de proveer el cargo de ${employee.position || 'No especificado'} en ${employee.department || 'No especificado'} de la APS Panguipulli, dentro del marco presupuestario aprobado.`);
  b.considerando(2, `Que, el/la postulante ${employee.full_name}, RUT ${employee.rut}, cumple con los requisitos legales, académicos y técnicos exigidos para el cargo de ${employee.position || 'No especificado'} de la Categoría ${employee.category} (${CATEGORY_NAMES[employee.category] || ''}).`);
  b.considerando(3, `Que, el tipo de contratación corresponde a la modalidad "${employee.contract_type || 'No especificado'}", conforme a la normativa de atención primaria municipal aplicable.`);
  if (description) b.considerando(4, description);
  b.y += 4;

  b.text('RESUELVO:', { size: 10, bold: true, color: '#1a3a6e' });
  b.y += 2;
  b.resuelve(1, `NÓMBRESE / CONTRÁTESE a ${employee.full_name}, RUT ${employee.rut}, en el cargo de ${employee.position || 'No especificado'}, Categoría ${employee.category} (${CATEGORY_NAMES[employee.category] || ''}), nivel ${employee.current_level || '—'}, bajo la modalidad de contrato "${employee.contract_type || 'No especificado'}", a contar del ${formatDate(resolution_date)}.`);
  if (sb != null) {
    b.resuelve(2, `FÍJASE la remuneración mensual bruta en ${formatCLP(sb * 2)}, compuesta por Sueldo Base ${formatCLP(sb)} y Asignación APS ${formatCLP(sb)}, según tabla salarial ${SALARY_YEAR} para Categoría ${employee.category}, nivel ${employee.current_level}.`);
  }
  b.resuelve(3, 'INSTRÚYASE al/la funcionario/a para que tome conocimiento de sus funciones, del Reglamento Interno del Establecimiento y de la normativa aplicable a su cargo.');
  b.resuelve(4, 'NOTIFÍQUESE al/la funcionario/a y remítase copia a la Unidad de Contabilidad y al Departamento de Recursos Humanos.');
  b.resuelve(5, 'ANÓTESE, COMUNÍQUESE Y ARCHÍVESE.');

  b.signaturesBlock(resolution_date);
  b.save(`ResolucionContrato_${employee.rut}_N${resolution_number}.pdf`);
}

export function generarResolucionPosttitulo({ resolution, employee }) {
  const b = new ResolutionPDFBuilder();
  const { resolution_number, resolution_date, description } = resolution;
  const pct = employee.postitle_percentage || 0;

  b.header(resolution_number, resolution_date);
  b.text('ASIGNACIÓN DE POSTÍTULO / POSTGRADO', { size: 11, bold: true, center: true, color: '#1a3a6e', leading: 8 });
  b.y += 4;
  b.line();

  b.text('VISTOS:', { size: 10, bold: true, color: '#1a3a6e' });
  b.y += 2;
  b.text(
    `Lo dispuesto en los artículos 37 y 38 de la Ley N° 19.378 sobre Asignación de Postítulo; el Decreto Supremo N° 1.889/1995 del MINSAL; los certificados de postítulo o postgrado acompañados por el/la funcionario/a; y el informe favorable de la Unidad de Recursos Humanos.`,
    { size: 9.5, color: '#333333', leading: 5.5 }
  );
  b.y += 4;

  b.text('CONSIDERANDO:', { size: 10, bold: true, color: '#1a3a6e' });
  b.y += 2;
  b.considerando(1, `Que, el/la funcionario/a ${employee.full_name}, RUT ${employee.rut}, Categoría ${employee.category}, ha presentado la documentación acreditativa de la obtención de un título de postítulo/postgrado reconocido por la autoridad competente.`);
  b.considerando(2, `Que, verificados los antecedentes, la Unidad de Recursos Humanos certifica que el postítulo acreditado cumple con los requisitos establecidos en el artículo 37 de la Ley N° 19.378 para acceder a la Asignación de Postítulo.`);
  b.considerando(3, `Que, conforme a la normativa vigente, corresponde reconocer una asignación de postítulo equivalente al ${pct}% del sueldo base mensual del/la funcionario/a.`);
  if (description) b.considerando(4, description);
  b.y += 4;

  b.text('RESUELVO:', { size: 10, bold: true, color: '#1a3a6e' });
  b.y += 2;
  b.resuelve(1, `RECONÓCESE la Asignación de Postítulo al/la funcionario/a ${employee.full_name}, RUT ${employee.rut}, Categoría ${employee.category}, a contar del ${formatDate(resolution_date)}, equivalente al ${pct}% de su sueldo base mensual, de conformidad con el artículo 37 de la Ley N° 19.378.`);
  b.resuelve(2, 'INCORPÓRESE en la hoja de vida del/la funcionario/a el presente reconocimiento de asignación de postítulo y actualícese el puntaje de carrera funcionaria.');
  b.resuelve(3, 'NOTIFÍQUESE al/la funcionario/a afectado/a y a la Unidad de Contabilidad para el pago de la asignación correspondiente.');
  b.resuelve(4, 'ANÓTESE, COMUNÍQUESE Y ARCHÍVESE.');

  b.signaturesBlock(resolution_date);
  b.save(`ResolucionPosttitulo_${employee.rut}_N${resolution_number}.pdf`);
}

export function generarResolucionDesvinculacion({ resolution, employee }) {
  const b = new ResolutionPDFBuilder();
  const { resolution_number, resolution_date, description } = resolution;

  b.header(resolution_number, resolution_date);
  b.text('TÉRMINO DE CONTRATO / DESVINCULACIÓN', { size: 11, bold: true, center: true, color: '#1a3a6e', leading: 8 });
  b.y += 4;
  b.line();

  b.text('VISTOS:', { size: 10, bold: true, color: '#1a3a6e' });
  b.y += 2;
  b.text(
    `La Ley N° 19.378 Estatuto de Atención Primaria de Salud Municipal; la Ley N° 18.883; los antecedentes del contrato del/la funcionario/a; y la causal de término que se indica en el considerando respectivo.`,
    { size: 9.5, color: '#333333', leading: 5.5 }
  );
  b.y += 4;

  b.text('CONSIDERANDO:', { size: 10, bold: true, color: '#1a3a6e' });
  b.y += 2;
  b.considerando(1, `Que, el/la funcionario/a ${employee.full_name}, RUT ${employee.rut}, presta servicios en la APS Panguipulli en el cargo de ${employee.position || 'No especificado'} de la Categoría ${employee.category}, bajo la modalidad "${employee.contract_type || 'No especificado'}".`);
  b.considerando(2, `Que, se ha configurado la causal de término de la prestación de servicios conforme a lo establecido en la normativa aplicable.`);
  if (description) b.considerando(3, description);
  b.y += 4;

  b.text('RESUELVO:', { size: 10, bold: true, color: '#1a3a6e' });
  b.y += 2;
  b.resuelve(1, `PÓNGASE término a los servicios prestados por el/la funcionario/a ${employee.full_name}, RUT ${employee.rut}, en el cargo de ${employee.position || 'No especificado'}, Categoría ${employee.category}, a contar del ${formatDate(resolution_date)}.`);
  b.resuelve(2, 'INSTRÚYASE al/la funcionario/a para que haga entrega formal del cargo, bienes, documentos y accesos que le hubieren sido asignados, dentro del plazo legal correspondiente.');
  b.resuelve(3, 'NOTIFÍQUESE personalmente al/la funcionario/a y remítase copia a la Unidad de Contabilidad, Informática y Departamento de Recursos Humanos.');
  b.resuelve(4, 'ANÓTESE, COMUNÍQUESE Y ARCHÍVESE.');

  b.signaturesBlock(resolution_date);
  b.save(`ResolucionDesvinculacion_${employee.rut}_N${resolution_number}.pdf`);
}

export function generarResolucionOtro({ resolution, employee }) {
  const b = new ResolutionPDFBuilder();
  const { resolution_number, resolution_date, description } = resolution;

  b.header(resolution_number, resolution_date);
  b.text('ACTO ADMINISTRATIVO — RECURSOS HUMANOS', { size: 11, bold: true, center: true, color: '#1a3a6e', leading: 8 });
  b.y += 4;
  b.line();

  b.text('VISTOS:', { size: 10, bold: true, color: '#1a3a6e' });
  b.y += 2;
  b.text(
    'La Ley N° 19.378 Estatuto de Atención Primaria de Salud Municipal; la Ley N° 18.883; y los antecedentes que obran en poder de esta Dirección.',
    { size: 9.5, color: '#333333', leading: 5.5 }
  );
  b.y += 4;

  b.text('CONSIDERANDO:', { size: 10, bold: true, color: '#1a3a6e' });
  b.y += 2;
  if (employee) {
    b.considerando(1, `Que, el/la funcionario/a ${employee.full_name}, RUT ${employee.rut}, presta servicios en la APS Panguipulli en el cargo de ${employee.position || 'No especificado'} de la Categoría ${employee.category}.`);
    if (description) b.considerando(2, description);
  } else if (description) {
    b.considerando(1, description);
  }
  b.y += 4;

  b.text('RESUELVO:', { size: 10, bold: true, color: '#1a3a6e' });
  b.y += 2;
  if (description) {
    b.resuelve(1, description);
  } else {
    b.resuelve(1, `[COMPLETAR EL TEXTO DE LA RESOLUCIÓN SEGÚN CORRESPONDA]`);
  }
  b.resuelve(2, 'NOTIFÍQUESE al/la funcionario/a afectado/a y a las unidades correspondientes.');
  b.resuelve(3, 'ANÓTESE, COMUNÍQUESE Y ARCHÍVESE.');

  b.signaturesBlock(resolution_date);
  b.save(`Resolucion_${resolution_number}.pdf`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export function generarResolucionPDF({ resolution, employee }) {
  switch (resolution.type) {
    case 'Cambio de Nivel':           return generarResolucionCambioNivel({ resolution, employee });
    case 'Reconocimiento de Bienio':  return generarResolucionBienio({ resolution, employee });
    case 'Contrato':                  return generarResolucionContrato({ resolution, employee });
    case 'Asignación de Postítulo':   return generarResolucionPosttitulo({ resolution, employee });
    case 'Desvinculación':            return generarResolucionDesvinculacion({ resolution, employee });
    default:                          return generarResolucionOtro({ resolution, employee });
  }
}