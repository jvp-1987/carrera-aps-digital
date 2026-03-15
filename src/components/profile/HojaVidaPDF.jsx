import { useState } from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getSueldoBase } from '@/components/profile/SalarialTab';
import jsPDF from 'jspdf';

function fmt(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

function fmtNum(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-CL').format(n);
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return d; }
}

export default function HojaVidaPDF({ employee }) {
  const [generating, setGenerating] = useState(false);

  const { data: servicePeriods = [] } = useQuery({
    queryKey: ['service-periods', employee.id],
    queryFn: () => base44.entities.ServicePeriod.filter({ employee_id: employee.id }, '-start_date'),
  });
  const { data: resolutions = [] } = useQuery({
    queryKey: ['resolutions', employee.id],
    queryFn: () => base44.entities.Resolution.filter({ employee_id: employee.id }, '-resolution_date'),
  });
  const { data: trainings = [] } = useQuery({
    queryKey: ['trainings', employee.id],
    queryFn: () => base44.entities.Training.filter({ employee_id: employee.id }, '-completion_date'),
  });
  const { data: leaves = [] } = useQuery({
    queryKey: ['leaves', employee.id],
    queryFn: () => base44.entities.LeaveWithoutPay.filter({ employee_id: employee.id }, '-start_date'),
  });
  const { data: demerits = [] } = useQuery({
    queryKey: ['demerits', employee.id],
    queryFn: () => base44.entities.DemeritNote.filter({ employee_id: employee.id }, '-date'),
  });
  const { data: evaluations = [] } = useQuery({
    queryKey: ['evaluations', employee.id],
    queryFn: () => base44.entities.PerformanceEvaluation.filter({ employee_id: employee.id }, '-evaluation_year'),
  });

  const generatePDF = async () => {
    setGenerating(true);
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pw = 210; // page width
      const ml = 15; // margin left
      const mr = 15; // margin right
      const cw = pw - ml - mr; // content width
      let y = 15;

      const LINE_H = 5.5;
      const SECTION_GAP = 7;

      // ── Color helpers ──────────────────────────────────────────
      const headerBg = [37, 99, 235];   // indigo-600
      const sectionBg = [241, 245, 249]; // slate-100
      const rowAlt = [248, 250, 252];    // slate-50
      const textDark = [15, 23, 42];
      const textMid = [71, 85, 105];
      const textLight = [148, 163, 184];

      function newPage() {
        doc.addPage();
        y = 15;
        // page footer
        doc.setFontSize(7);
        doc.setTextColor(...textLight);
        doc.text(`Corporación Municipal de Panguipulli — Área Salud · ${employee.full_name} · ${new Date().toLocaleDateString('es-CL')}`, ml, 290);
      }

      function checkPageBreak(needed = 10) {
        if (y + needed > 278) newPage();
      }

      function drawSectionTitle(title) {
        checkPageBreak(12);
        doc.setFillColor(...sectionBg);
        doc.roundedRect(ml, y, cw, 8, 1.5, 1.5, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...headerBg);
        doc.text(title.toUpperCase(), ml + 4, y + 5.5);
        y += 11;
      }

      function drawKV(label, value, x = ml, colW = cw, inline = false) {
        const valStr = String(value ?? '—');
        if (inline) {
          doc.setFontSize(7.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...textMid);
          doc.text(label + ':', x, y);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...textDark);
          doc.text(valStr, x + doc.getTextWidth(label + ': ') + 1, y);
          return;
        }
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...textMid);
        doc.text(label, x, y);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...textDark);
        const lines = doc.splitTextToSize(valStr, colW - 2);
        doc.text(lines, x, y + 3.5);
        y += 3.5 + lines.length * 3.5;
      }

      function drawRow(cols, widths, isHeader = false, isAlt = false) {
        checkPageBreak(LINE_H + 2);
        if (isAlt) { doc.setFillColor(...rowAlt); doc.rect(ml, y - 1, cw, LINE_H + 0.5, 'F'); }
        if (isHeader) { doc.setFillColor(...headerBg); doc.rect(ml, y - 1, cw, LINE_H + 0.5, 'F'); }
        let cx = ml + 2;
        cols.forEach((col, i) => {
          doc.setFontSize(isHeader ? 7 : 7.5);
          doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
          doc.setTextColor(isHeader ? 255 : (isAlt ? textDark[0] : textDark[0]), isHeader ? 255 : (isAlt ? textDark[1] : textDark[1]), isHeader ? 255 : textDark[2]);
          const txt = doc.splitTextToSize(String(col ?? '—'), widths[i] - 2);
          doc.text(txt, cx, y + 3);
          cx += widths[i];
        });
        y += LINE_H + 1;
      }

      // ══════════════════════════════════════════════════════════
      // 1. ENCABEZADO INSTITUCIONAL
      // ══════════════════════════════════════════════════════════

      // Franja superior roja institucional (color corporativo CORMUPA)
      const red = [185, 28, 28];   // rojo corporativo
      const redLight = [220, 38, 38];

      doc.setFillColor(...red);
      doc.rect(0, 0, pw, 36, 'F');

      // Franja lateral izquierda decorativa
      doc.setFillColor(...redLight);
      doc.rect(0, 0, 3, 36, 'F');

      // Símbolo decorativo corazón (círculo + texto)
      doc.setFillColor(255, 255, 255);
      doc.circle(ml + 7, 18, 7, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...red);
      doc.text('♥', ml + 4.5, 20.5);

      // Nombre institución
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('CORPORACIÓN MUNICIPAL DE PANGUIPULLI', ml + 18, 13);

      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 220, 220);
      doc.text('ÁREA SALUD', ml + 18, 20);

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(255, 200, 200);
      doc.text('Sistema de Gestión Carrera Funcionaria — Ley N° 19.378', ml + 18, 26);

      // Fecha emisión (derecha)
      doc.setFontSize(7);
      doc.setTextColor(255, 200, 200);
      const fechaEmision = `Emitido: ${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}`;
      doc.text(fechaEmision, pw - mr - doc.getTextWidth(fechaEmision), 33);

      // Línea separadora dorada
      doc.setDrawColor(251, 191, 36);
      doc.setLineWidth(0.8);
      doc.line(0, 36, pw, 36);
      doc.setLineWidth(0.2);

      // Sub-franja gris claro con título del documento
      doc.setFillColor(248, 250, 252);
      doc.rect(0, 36, pw, 10, 'F');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...textDark);
      doc.text('HOJA DE VIDA FUNCIONARIA', ml, 43);

      // Initials avatar (derecha)
      const initials = employee.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??';
      doc.setFillColor(...red);
      doc.circle(pw - mr - 8, 43, 5, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(initials, pw - mr - 8 - doc.getTextWidth(initials) / 2, 45);

      y = 52;

      // ══════════════════════════════════════════════════════════
      // 2. DATOS PERSONALES Y LABORALES
      // ══════════════════════════════════════════════════════════
      drawSectionTitle('1. Datos Personales y Laborales');

      const col1 = ml;
      const col2 = ml + cw / 2 + 5;
      const halfW = cw / 2 - 5;

      // Row 1
      const startY = y;
      drawKV('Nombre Completo', employee.full_name, col1, halfW);
      y = startY;
      drawKV('RUT', employee.rut, col2, halfW);
      y = Math.max(y, startY + 8);

      const startY2 = y;
      drawKV('Cargo', employee.position || '—', col1, halfW);
      y = startY2;
      drawKV('Unidad / Establecimiento', employee.department || '—', col2, halfW);
      y = Math.max(y, startY2 + 8);

      const startY3 = y;
      drawKV('Tipo de Contrato', employee.contract_type || '—', col1, halfW);
      y = startY3;
      drawKV('Fecha de Ingreso', fmtDate(employee.hire_date), col2, halfW);
      y = Math.max(y, startY3 + 8);

      const startY4 = y;
      drawKV('Categoría Funcionaria', `Categoría ${employee.category || '—'}`, col1, halfW);
      y = startY4;
      drawKV('Nivel Escalafón', `Nivel ${employee.current_level ?? '—'}`, col2, halfW);
      y = Math.max(y, startY4 + 8);

      const startY5 = y;
      drawKV('Estado', employee.status || '—', col1, halfW);
      y = startY5;
      drawKV('Correo Electrónico', employee.email || '—', col2, halfW);
      y = Math.max(y, startY5 + 8);

      y += SECTION_GAP;

      // ══════════════════════════════════════════════════════════
      // 3. RESUMEN DE PUNTAJES
      // ══════════════════════════════════════════════════════════
      drawSectionTitle('2. Resumen de Puntajes Carrera Funcionaria');

      const boxes = [
        { label: 'Pts. Experiencia', value: fmtNum(employee.bienio_points) },
        { label: 'Pts. Capacitación', value: fmtNum(employee.training_points) },
        { label: 'Puntaje Total', value: fmtNum(employee.total_points) },
        { label: 'Bienios', value: fmtNum(employee.bienios_count) },
        { label: 'Postítulo', value: `${employee.postitle_percentage || 0}%` },
      ];
      const bw = cw / boxes.length;
      boxes.forEach((b, i) => {
        doc.setFillColor(238, 242, 255);
        doc.roundedRect(ml + i * bw, y, bw - 1, 13, 1, 1, 'F');
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...textMid);
        doc.text(b.label, ml + i * bw + (bw - 1) / 2 - doc.getTextWidth(b.label) / 2, y + 4);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...headerBg);
        doc.text(b.value, ml + i * bw + (bw - 1) / 2 - doc.getTextWidth(b.value) / 2, y + 10.5);
      });
      y += 17;

      const totalLeaveDays = leaves.reduce((s, l) => s + (l.days_count || 0), 0);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...textMid);
      doc.text(`Días experiencia bruta: ${fmtNum(employee.total_experience_days || 0)}  ·  Permisos sin goce descontados: ${fmtNum(totalLeaveDays)} días  ·  Ant. neta: ${fmtNum((employee.total_experience_days || 0) - totalLeaveDays)} días  ·  Próximo bienio: ${fmtDate(employee.next_bienio_date)}`, ml, y);
      y += SECTION_GAP + 3;

      // ══════════════════════════════════════════════════════════
      // 4. SITUACIÓN SALARIAL 2026
      // ══════════════════════════════════════════════════════════
      drawSectionTitle('3. Situación Salarial 2026 (Ley 19.378)');

      const sueldoBase = getSueldoBase(employee.category, employee.current_level);
      const asigAPS = sueldoBase;
      const bruto = sueldoBase != null ? sueldoBase * 2 : null;

      const salBoxes = [
        { label: 'Sueldo Base', value: fmt(sueldoBase), sub: `Cat. ${employee.category} · Niv. ${employee.current_level}` },
        { label: 'Asignación APS', value: fmt(asigAPS), sub: 'Art. 25 Ley 19.378 (100%)' },
        { label: 'Base Bruto Imponible', value: fmt(bruto), sub: 'Sueldo Base + Asig. APS' },
      ];
      const sbw = cw / 3;
      salBoxes.forEach((b, i) => {
        const colors = [[238, 242, 255], [237, 233, 254], [236, 253, 245]];
        const tcolors = [[37, 99, 235], [109, 40, 217], [5, 150, 105]];
        doc.setFillColor(...colors[i]);
        doc.roundedRect(ml + i * sbw, y, sbw - 1, 16, 1.5, 1.5, 'F');
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...textMid);
        doc.text(b.label, ml + i * sbw + (sbw - 1) / 2 - doc.getTextWidth(b.label) / 2, y + 4);
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...tcolors[i]);
        doc.text(b.value, ml + i * sbw + (sbw - 1) / 2 - doc.getTextWidth(b.value) / 2, y + 10);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...textLight);
        doc.text(b.sub, ml + i * sbw + (sbw - 1) / 2 - doc.getTextWidth(b.sub) / 2, y + 14);
      });
      y += 20;
      y += SECTION_GAP;

      // ══════════════════════════════════════════════════════════
      // 5. HISTORIAL DE PERIODOS DE SERVICIO
      // ══════════════════════════════════════════════════════════
      drawSectionTitle('4. Historial de Periodos de Servicio');
      drawRow(['Institución', 'Tipo', 'Inicio', 'Término', 'Días'], [60, 30, 30, 30, 30], true);
      if (servicePeriods.length === 0) {
        checkPageBreak(8);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...textLight);
        doc.text('Sin periodos registrados', ml + 2, y + 3); y += 8;
      } else {
        servicePeriods.forEach((p, i) => {
          drawRow([p.institution || '—', p.period_type || '—', fmtDate(p.start_date), fmtDate(p.end_date), fmtNum(p.days_count)], [60, 30, 30, 30, 30], false, i % 2 === 1);
        });
      }
      y += SECTION_GAP;

      // ══════════════════════════════════════════════════════════
      // 6. HISTORIAL DE ASCENSOS (LÍNEA DE CARRERA)
      // ══════════════════════════════════════════════════════════
      const promotions = resolutions.filter(r => r.type === 'Cambio de Nivel');
      drawSectionTitle('5. Línea de Tiempo de Carrera — Ascensos');
      drawRow(['N° Resolución', 'Fecha Res.', 'Nivel Ant.', 'Nivel Nuevo', 'Descripción'], [38, 25, 22, 25, 70], true);
      if (promotions.length === 0) {
        checkPageBreak(8);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...textLight);
        doc.text('Sin ascensos registrados', ml + 2, y + 3); y += 8;
      } else {
        promotions.sort((a, b) => new Date(a.resolution_date) - new Date(b.resolution_date)).forEach((r, i) => {
          const vigenciaMatch = r.description?.match(/\[Vigencia: ([^\]]+)\]/);
          const desc = r.description?.replace(/\[[^\]]+\]/g, '').trim() || '—';
          drawRow([r.resolution_number, fmtDate(r.resolution_date), String(r.previous_level ?? '—'), String(r.new_level ?? '—'), desc], [38, 25, 22, 25, 70], false, i % 2 === 1);
        });
      }
      y += SECTION_GAP;

      // ══════════════════════════════════════════════════════════
      // 7. RESOLUCIONES ADMINISTRATIVAS
      // ══════════════════════════════════════════════════════════
      checkPageBreak(20);
      drawSectionTitle('6. Resoluciones y Actos Administrativos');
      drawRow(['N° Resolución', 'Fecha', 'Tipo', 'Descripción'], [35, 25, 40, 80], true);
      if (resolutions.length === 0) {
        checkPageBreak(8);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...textLight);
        doc.text('Sin resoluciones registradas', ml + 2, y + 3); y += 8;
      } else {
        resolutions.forEach((r, i) => {
          drawRow([r.resolution_number, fmtDate(r.resolution_date), r.type, r.description?.replace(/\[[^\]]+\]/g, '').trim() || '—'], [35, 25, 40, 80], false, i % 2 === 1);
        });
      }
      y += SECTION_GAP;

      // ══════════════════════════════════════════════════════════
      // 8. CAPACITACIONES
      // ══════════════════════════════════════════════════════════
      checkPageBreak(20);
      drawSectionTitle('7. Capacitaciones y Formación');
      drawRow(['Curso / Actividad', 'Institución', 'Horas', 'Nota', 'Nivel', 'Pts.', 'Estado'], [60, 35, 15, 12, 20, 13, 25], true);
      if (trainings.length === 0) {
        checkPageBreak(8);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...textLight);
        doc.text('Sin capacitaciones registradas', ml + 2, y + 3); y += 8;
      } else {
        trainings.forEach((t, i) => {
          drawRow([t.course_name, t.institution || '—', String(t.hours), String(t.grade), t.technical_level || '—', String(t.calculated_points ?? '—'), t.status || '—'], [60, 35, 15, 12, 20, 13, 25], false, i % 2 === 1);
        });
      }
      y += SECTION_GAP;

      // ══════════════════════════════════════════════════════════
      // 9. PERMISOS SIN GOCE DE SUELDO
      // ══════════════════════════════════════════════════════════
      checkPageBreak(20);
      drawSectionTitle('8. Permisos Sin Goce de Sueldo');
      drawRow(['Inicio', 'Término', 'Días', 'N° Resolución', 'Motivo'], [28, 28, 18, 35, 71], true);
      if (leaves.length === 0) {
        checkPageBreak(8);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...textLight);
        doc.text('Sin permisos registrados', ml + 2, y + 3); y += 8;
      } else {
        leaves.forEach((l, i) => {
          drawRow([fmtDate(l.start_date), fmtDate(l.end_date), String(l.days_count), l.resolution_number || '—', l.reason || '—'], [28, 28, 18, 35, 71], false, i % 2 === 1);
        });
        checkPageBreak(8);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...headerBg);
        doc.text(`Total días descontados de antigüedad: ${fmtNum(totalLeaveDays)} días`, ml + 2, y + 3);
        y += 8;
      }
      y += SECTION_GAP;

      // ══════════════════════════════════════════════════════════
      // 10. EVALUACIONES DE DESEMPEÑO
      // ══════════════════════════════════════════════════════════
      checkPageBreak(20);
      drawSectionTitle('9. Evaluaciones de Desempeño');
      drawRow(['Año', 'Puntaje', 'Calificación', 'Evaluador', 'N° Resolución'], [20, 20, 65, 45, 30], true);
      if (evaluations.length === 0) {
        checkPageBreak(8);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...textLight);
        doc.text('Sin evaluaciones registradas', ml + 2, y + 3); y += 8;
      } else {
        evaluations.forEach((e, i) => {
          drawRow([String(e.evaluation_year), String(e.score), e.rating, e.evaluator || '—', e.resolution_number || '—'], [20, 20, 65, 45, 30], false, i % 2 === 1);
        });
      }
      y += SECTION_GAP;

      // ══════════════════════════════════════════════════════════
      // 11. ANOTACIONES DE DEMÉRITO
      // ══════════════════════════════════════════════════════════
      checkPageBreak(20);
      drawSectionTitle('10. Anotaciones de Demérito');
      const activeDemerits = demerits.filter(d => d.status !== 'Anulada');
      const totalImpact = activeDemerits.reduce((s, d) => s + (d.impact_score || 0), 0);
      drawRow(['Fecha', 'Tipo', 'Descripción', 'Impacto', 'Estado', 'N° Acto'], [22, 38, 54, 17, 22, 27], true);
      if (demerits.length === 0) {
        checkPageBreak(8);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...textLight);
        doc.text('Sin anotaciones de demérito', ml + 2, y + 3); y += 8;
      } else {
        demerits.forEach((d, i) => {
          drawRow([fmtDate(d.date), d.type, d.description || '—', String(d.impact_score ?? 0), d.status, d.resolution_number || '—'], [22, 38, 54, 17, 22, 27], false, i % 2 === 1);
        });
        checkPageBreak(8);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(220, 38, 38);
        doc.text(`Impacto total vigente en puntaje: ${totalImpact} puntos`, ml + 2, y + 3);
        y += 8;
      }
      y += SECTION_GAP;

      // ══════════════════════════════════════════════════════════
      // 12. FIRMA Y LEGALIZACIÓN
      // ══════════════════════════════════════════════════════════
      checkPageBreak(45);
      y += 5;
      doc.setFillColor(...sectionBg);
      doc.roundedRect(ml, y, cw, 38, 2, 2, 'F');

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...textMid);
      doc.text('Este documento ha sido generado automáticamente desde el Sistema de Gestión de Carrera Funcionaria de la Corporación Municipal', ml + 4, y + 6);
      doc.text('de Panguipulli — Área Salud, conforme a lo dispuesto en la Ley N° 19.378 y sus modificaciones. Para efectos legales se', ml + 4, y + 10);
      doc.text('requiere firma y timbre del/la Secretario/a General de la Corporación Municipal de Panguipulli o de quien lo subrogue.', ml + 4, y + 14);

      const sigY = y + 22;
      const sig1x = ml + 10;
      const sig2x = ml + cw / 2 + 10;

      doc.setDrawColor(...textMid);
      doc.line(sig1x, sigY, sig1x + 65, sigY);
      doc.setFontSize(7);
      doc.setTextColor(...textMid);
      doc.text('Firma y Timbre Secretario/a General', sig1x, sigY + 4);
      doc.text('Corporación Municipal de Panguipulli', sig1x, sigY + 8);

      doc.line(sig2x, sigY, sig2x + 65, sigY);
      doc.text('Firma Funcionario(a)', sig2x, sigY + 4);
      doc.text(`RUT: ${employee.rut || '—'}`, sig2x, sigY + 8);

      // ── Footer on all pages ─────────────────────────────────
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(...textLight);
        doc.setTextColor(...textLight);
        doc.text(`Corporación Municipal de Panguipulli — Área Salud · ${employee.full_name} · ${new Date().toLocaleDateString('es-CL')}`, ml, 290);
        doc.text(`Pág. ${i} / ${totalPages}`, pw - mr - 15, 290);
      }

      doc.save(`HojaVida_${employee.full_name?.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('PDF generado exitosamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al generar el PDF');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button
      onClick={generatePDF}
      disabled={generating}
      className="bg-emerald-600 hover:bg-emerald-700 gap-2"
      size="sm"
    >
      {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
      {generating ? 'Generando PDF...' : 'Descargar Hoja de Vida'}
    </Button>
  );
}