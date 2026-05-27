import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, getDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBR88EcYJPL3xIdr5X_p8cx2TEjz7LuzpM",
    authDomain: "lab-cttc.firebaseapp.com",
    projectId: "lab-cttc",
    storageBucket: "lab-cttc.firebasestorage.app",
    messagingSenderId: "588785890026",
    appId: "1:588785890026:web:27ec4ea43a8a749989dd93"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const colRef = collection(db, "gramajes");
const colIncertidumbre = collection(db, "incertidumbre");

let editandoId = null;
let currentOT = null;
let currentMuestra = null;
let currentEnsayo = null;
let esRepeticionActiva = false;
window.currentUserRole = 'visor'; // Por defecto solo lectura

const mockEnsayos = [
    "GRAMAJE ASTM D3776",
    "Solides",
    "Encogimiento"
];

// Simulación de las Órdenes de Trabajo (OT)
const mockOTs = [
    { id: "OT-2026-001", muestras: ["MUE-A100", "MUE-A101"], estado: "Terminado" },
    { id: "OT-2026-002", muestras: ["MUE-B200"], estado: "Terminado" },
    { id: "OT-2026-003", muestras: ["MUE-C300", "MUE-C301", "MUE-C302"], estado: "Pendiente" }
];

// --- Función para Expandir/Contraer Secciones ---
window.toggleSection = function(contentId, headerElement) {
    const content = document.getElementById(contentId);
    const icon = headerElement.querySelector('span:last-child');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        if (icon) icon.innerText = '▼';
    } else {
        content.style.display = 'none';
        if (icon) icon.innerText = '▶';
    }
};

// --- Función de Cálculo de Diferencia Crítica ---
function calcularDiferenciaCritica() {
    const rows = document.getElementById('resultadoCuerpo').querySelectorAll('tr');
    const panel = document.getElementById('panelDiferencia');
    
    // Necesitamos al menos 2 registros para comparar
    if (rows.length >= 2) {
        // Asumimos que toma los dos más recientes (rows[0] es el último ingresado, rows[1] es el anterior)
        // Columna 7 corresponde a "Promedio (g/m²)" (desplazado por el checkbox nuevo)
        const valB = parseFloat(rows[0].cells[7].innerText); // Equivalente a J25 (Repetición)
        const valA = parseFloat(rows[1].cells[7].innerText); // Equivalente a J22 (Original)
        
        if (!isNaN(valA) && !isNaN(valB) && valA !== 0) {
            // 1. Diferencia simple: =ABS(J22-J25)
            const difSimple = Math.abs(valA - valB);
            
            // 2. Margen: =ABS(((J25*100)/J22)-100)/100
            const margen = Math.abs(((valB * 100) / valA) - 100) / 100;
            
            // 3. Diferencia crítica final: diferencia simple - margen
            const difCriticaFinal = difSimple - margen;
            
            document.getElementById('difSimpleVal').innerText = difSimple.toFixed(4);
            document.getElementById('difMargenVal').innerText = (margen * 100).toFixed(1) + "%"; // Muestra un decimal (Ej: 28.6%)
            document.getElementById('difCriticaVal').innerText = difCriticaFinal.toFixed(4);
            
            document.getElementById('difValoresEvaluados').innerText = `Valores evaluados (Promedio g/m²): Original (J22) = ${valA} | Repetición (J25) = ${valB}`;
            
            const msg = document.getElementById('difCriticaMsg');
            msg.innerText = margen < 0.03 ? "✅ Cumple con el margen (˂ 3%)" : "❌ No cumple con el margen (≥ 3%)";
            msg.style.color = margen < 0.03 ? "#217346" : "#c0392b";
            
            panel.style.display = 'block';
            return;
        }
    }
    panel.style.display = 'none'; // Ocultar si hay menos de 2 registros
}

// --- Función de Cálculo Opción C ---
function calcularOpcionC() {
    const rows = document.getElementById('resultadoCuerpo').querySelectorAll('tr');
    const panel = document.getElementById('panelOpcionC');
    let rowOriginal = null;

    // Buscar el registro original más reciente (que NO sea repetición)
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].cells[4].innerText === 'No') {
            rowOriginal = rows[i];
            break; // Tomamos el primero que cumpla (el más reciente)
        }
    }

    if (rowOriginal) {
        const ancho = parseFloat(rowOriginal.cells[3].innerText); // Ancho en mm
        const pesosStr = rowOriginal.cells[5].innerText;
        const gramajesStr = rowOriginal.cells[6].innerText;

        if (!isNaN(ancho) && ancho > 0 && pesosStr !== '-' && gramajesStr !== '-') {
            const pesos = pesosStr.split(',').map(p => parseFloat(p));
            const gramajes = gramajesStr.split(',').map(g => parseFloat(g));
            const numProbetas = pesos.length;
            
            const gmList = [], mkgList = [], ozyd2List = [], ozydList = [], ydlbList = [];

            for (let i = 0; i < numProbetas; i++) {
                const gr_m2 = gramajes[i];
                
                // g/m: g/m2 * ancho(m) - Se multiplica para obtener la masa lineal correcta
                const g_m = gr_m2 * (ancho / 1000);
                gmList.push(g_m);

                // m/Kg: 1000 / g/m
                const m_kg = g_m > 0 ? 1000 / g_m : 0;
                mkgList.push(m_kg);

                // Oz/yd²: g/m2 / 33.906
                const oz_yd2 = gr_m2 / 33.906;
                ozyd2List.push(oz_yd2);

                // Oz/yd: Oz/yd2 * ancho(yd) -> 1 mm = 1/914.4 yd
                const oz_yd = oz_yd2 * (ancho / 914.4);
                ozydList.push(oz_yd);

                // yd/lb: 16 / Oz/yd
                const yd_lb = oz_yd > 0 ? 16 / oz_yd : 0;
                ydlbList.push(yd_lb);
            }

            const promediar = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

            const renderRow = (title, arr) => {
                let html = `<tr><td style="font-weight: bold; text-align: left; padding: 8px; border: 1px solid #ccc;">${title}</td>`;
                arr.forEach(val => html += `<td style="padding: 8px; border: 1px solid #ccc;">${parseFloat(val.toFixed(4))}</td>`);
                html += `<td style="padding: 8px; border: 1px solid #ccc; font-weight: bold; background: #e6f4ea;">${parseFloat(promediar(arr).toFixed(4))}</td></tr>`;
                return html;
            };

            let headHtml = `<tr><th style="padding: 8px; border: 1px solid #ccc; background: #f3f3f3;">Resultado Opción C</th>`;
            for(let i = 1; i <= numProbetas; i++) headHtml += `<th style="padding: 8px; border: 1px solid #ccc; background: #f3f3f3;">Probeta ${i}</th>`;
            headHtml += `<th style="padding: 8px; border: 1px solid #ccc; background: #f3f3f3;">Promedio</th></tr>`;
            
            document.getElementById('headOpcionC').innerHTML = headHtml;
            document.getElementById('bodyOpcionC').innerHTML = renderRow("g/m (Gramo/metro lineal)", gmList) + renderRow("m/Kg (Metro lineal/Kg)", mkgList) + renderRow("Oz/yd² (Onza/yarda cuadrada)", ozyd2List) + renderRow("Oz/yd (Onza/yarda lineal)", ozydList) + renderRow("yd/lb (Yarda lineal/libra)", ydlbList);
            panel.style.display = 'block';
            return;
        }
    }
    panel.style.display = 'none'; // Ocultar si no hay registro original válido
}

// --- Generador de la Tabla de Eficacia ---
function generarTablasEficacia() {
    const container = document.getElementById('contenedorTablasEficacia');
    if (container.innerHTML !== '') return; // Evitar regenerar si ya existe
    
    let html = '';
    html += generarBloqueAnalistasEficacia('A1', 'A2');
    html += generarBloqueAnalistasEficacia('A3', 'A4');
    container.innerHTML = html;

    // Añadir listeners para calcular el promedio (g/m2) automáticamente
    const inputs = container.querySelectorAll('.efi-input');
    inputs.forEach(input => {
        input.addEventListener('input', calcularPromedioEficacia);
        input.addEventListener('paste', handlePasteEficacia);
        input.addEventListener('change', function(e) {
            const val = parseFloat(this.value);
            if (!isNaN(val)) {
                this.value = val.toFixed(2);
                calcularPromedioEficacia(e);
            }
        });
    });
}

function generarBloqueAnalistasEficacia(id1, id2) {
    let rows = '';
    for (let i = 1; i <= 10; i++) {
        rows += `
        <tr>
            <td style="text-align: center; font-weight: bold; padding: 5px;">${i}</td>
            <td style="padding: 2px;"><input type="number" step="0.01" class="efi-input efi-row-${id1}-${i}" data-analista="${id1}" data-row="${i}" style="width: 100%; box-sizing: border-box; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 3px;"></td>
            <td style="padding: 2px;"><input type="number" step="0.01" class="efi-input efi-row-${id1}-${i}" data-analista="${id1}" data-row="${i}" style="width: 100%; box-sizing: border-box; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 3px;"></td>
            <td style="padding: 2px;"><input type="number" step="0.01" class="efi-input efi-row-${id1}-${i}" data-analista="${id1}" data-row="${i}" style="width: 100%; box-sizing: border-box; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 3px;"></td>
            <td style="background: #eef; font-weight: bold; text-align: center; padding: 5px;" id="efi-prom-${id1}-${i}">-</td>
            <td style="text-align: center; font-weight: bold; border-left: 2px solid #004a8f; padding: 5px;">${i}</td>
            <td style="padding: 2px;"><input type="number" step="0.01" class="efi-input efi-row-${id2}-${i}" data-analista="${id2}" data-row="${i}" style="width: 100%; box-sizing: border-box; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 3px;"></td>
            <td style="padding: 2px;"><input type="number" step="0.01" class="efi-input efi-row-${id2}-${i}" data-analista="${id2}" data-row="${i}" style="width: 100%; box-sizing: border-box; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 3px;"></td>
            <td style="padding: 2px;"><input type="number" step="0.01" class="efi-input efi-row-${id2}-${i}" data-analista="${id2}" data-row="${i}" style="width: 100%; box-sizing: border-box; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 3px;"></td>
            <td style="background: #eef; font-weight: bold; text-align: center; padding: 5px;" id="efi-prom-${id2}-${i}">-</td>
        </tr>`;
    }
    
    return `
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 0.9em;" border="1">
        <thead style="background: #f3f3f3;">
            <tr>
                <th colspan="5" style="padding: 10px;">Analista ${id1}: <input type="text" id="nombre-analista-${id1}" placeholder="Nombre" style="padding: 5px; width: 60%; margin-left: 10px;"></th>
                <th colspan="5" style="padding: 10px; border-left: 2px solid #004a8f;">Analista ${id2}: <input type="text" id="nombre-analista-${id2}" placeholder="Nombre" style="padding: 5px; width: 60%; margin-left: 10px;"></th>
            </tr>
            <tr>
                <th style="padding: 8px;">#</th>
                <th style="padding: 8px;">Gramaje 1</th><th style="padding: 8px;">Gramaje 2</th><th style="padding: 8px;">Gramaje 3</th><th style="padding: 8px;">g/m²</th>
                <th style="border-left: 2px solid #004a8f; padding: 8px;">#</th>
                <th style="padding: 8px;">Gramaje 1</th><th style="padding: 8px;">Gramaje 2</th><th style="padding: 8px;">Gramaje 3</th><th style="padding: 8px;">g/m²</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;
}

function calcularPromedioEficacia(e) {
    const analista = e.target.getAttribute('data-analista');
    const row = e.target.getAttribute('data-row');
    const inputs = document.querySelectorAll(`.efi-row-${analista}-${row}`);
    
    let sum = 0; let count = 0;
    inputs.forEach(inp => {
        const val = parseFloat(inp.value);
        if (!isNaN(val)) { sum += val; count++; }
    });
    
    const cellProm = document.getElementById(`efi-prom-${analista}-${row}`);
    cellProm.innerText = count > 0 ? (sum / count).toFixed(2) : '-';
}

// --- Función para pegar desde Excel en la Matriz de Eficacia ---
function handlePasteEficacia(e) {
    e.preventDefault();
    const clipboardData = e.clipboardData || window.clipboardData;
    const pastedText = clipboardData.getData('Text');
    if (!pastedText) return;

    // Separar el texto pegado por filas (saltos de línea) y luego por columnas (tabulaciones)
    const rows = pastedText.trim().split(/\r\n|\n/).map(row => row.split('\t'));
    
    const targetInput = e.target;
    const tbody = targetInput.closest('tbody');
    if (!tbody) return;
    
    const trs = Array.from(tbody.querySelectorAll('tr'));
    const startTr = targetInput.closest('tr');
    const startRowIdx = trs.indexOf(startTr);
    
    const inputsInStartTr = Array.from(startTr.querySelectorAll('.efi-input'));
    const startColIdx = inputsInStartTr.indexOf(targetInput);

    for (let i = 0; i < rows.length; i++) {
        if (i + startRowIdx >= trs.length) break; // No exceder el límite de filas de la tabla
        const tr = trs[i + startRowIdx];
        const inputs = Array.from(tr.querySelectorAll('.efi-input'));
        
        for (let j = 0; j < rows[i].length; j++) {
            if (j + startColIdx >= inputs.length) break; // No exceder el límite de columnas
            const val = rows[i][j].trim();
            if (val !== '') {
                // Reemplazar comas por puntos en caso de Excel en español
                const num = parseFloat(val.replace(',', '.'));
                if (!isNaN(num)) {
                    inputs[j + startColIdx].value = num.toFixed(2);
                    // Disparar manualmente el evento para que se calcule el Promedio (g/m²)
                    inputs[j + startColIdx].dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        }
    }
}

// Carga de datos iniciales filtrados por la OT y Muestra seleccionadas
async function cargarDatos() {
    if (!currentOT || !currentMuestra) return;
    const q = query(colRef, orderBy("fecha", "desc"));
    const snapshot = await getDocs(q);
    document.getElementById('resultadoCuerpo').innerHTML = "";
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.otId === currentOT.id && data.codigoMuestra === currentMuestra) {
            renderFila(doc.id, data);
        }
    });
    calcularDiferenciaCritica();
    calcularOpcionC();
}

// Generar inputs dinámicos para los pesos
function generarInputsPesos(num) {
    const contenedor = document.getElementById('contenedorPesos');
    contenedor.innerHTML = '';
    for (let i = 1; i <= num; i++) {
        const input = document.createElement('input');
        input.type = 'number';
            input.step = '0.0001';
        input.className = 'peso-probeta';
        input.placeholder = `Peso Probeta ${i} (g)`;
        input.required = true;
        contenedor.appendChild(input);
    }
}

generarInputsPesos(5); // Generar 5 casillas por defecto

// Mostrar aviso según el tipo de corte
document.getElementById('tipoCorte').addEventListener('change', (e) => {
    const aviso = document.getElementById('avisoCorte');
    if (e.target.value === 'CIRCULAR') {
        aviso.textContent = "Área total de cortes (Certificado:IT-227-2024 ) - Corte forma Circular y el area debe ser 0.020042 m2";
        aviso.style.display = 'block';
    } else if (e.target.value === 'CUADRADO') {
        aviso.textContent = "Área total de cortes (Certificado:IT-227-2024 ) - Corte forma Cuadrado y el area debe ser 0.5 m2";
        aviso.style.display = 'block';
    } else {
        aviso.style.display = 'none';
    }
});

// Escuchar cambios en la cantidad de probetas
document.getElementById('numProbetas').addEventListener('input', (e) => {
    const num = parseInt(e.target.value) || 0;
    if (num > 0) {
        generarInputsPesos(num);
    }
});

// Lógica de cálculo y guardado
document.getElementById('gramajeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const tipoCorteSeleccionado = document.getElementById('tipoCorte').value;
    let areaCalculada = 0;
    if (tipoCorteSeleccionado === 'CIRCULAR') {
        areaCalculada = 0.020042;
    } else if (tipoCorteSeleccionado === 'CUADRADO') {
        areaCalculada = 0.5;
    }
    
    const inputsPesos = document.querySelectorAll('.peso-probeta');
    const pesos = [];
    const gramajesInd = [];
    let sumaGramajes = 0;
    let sumaPesos = 0;
    inputsPesos.forEach(input => {
        const val = parseFloat(input.value) || 0;
        const pesoRedondeado = parseFloat(val.toFixed(4));
        pesos.push(pesoRedondeado);
        sumaPesos += pesoRedondeado;
        
        // Cálculo individual por cada probeta (Peso / Área)
        const grInd = pesoRedondeado / areaCalculada;
        gramajesInd.push(parseFloat(grInd.toFixed(4)));
        sumaGramajes += grInd;
    });

    // Promedio de los gramajes calculados
    const grPromedio = inputsPesos.length > 0 ? parseFloat((sumaGramajes / inputsPesos.length).toFixed(4)) : 0;

    const data = {
        otId: currentOT.id,
        codigoMuestra: currentMuestra,
        esRepeticion: esRepeticionActiva,
        tipoCorte: tipoCorteSeleccionado,
        area: areaCalculada,
        numProbetas: parseInt(document.getElementById('numProbetas').value),
        anchoEspecimen: parseFloat(document.getElementById('anchoEspecimen').value),
        pesos: pesos,
        gramajesInd: gramajesInd,
        pesoTotal: sumaPesos,
        gr: parseFloat(grPromedio),
        fecha: new Date().toISOString()
    };

    if (editandoId) {
        await updateDoc(doc(db, "gramajes", editandoId), data);
        const row = document.getElementById(editandoId);
        if (row) {
            const repeticionDisplay = data.esRepeticion ? '<span style="color: #d97706; font-weight: bold;">Sí</span>' : 'No';
                const pesosDisplay = data.pesos ? data.pesos.map(p => parseFloat(Number(p).toFixed(4)) + 'g').join(', ') : '-';
            const anchoDisplay = data.anchoEspecimen != null ? Number(data.anchoEspecimen).toFixed(2) + ' mm' : '-';
                const gramajesIndDisplay = data.gramajesInd ? data.gramajesInd.map(g => parseFloat(Number(g).toFixed(4))).join(', ') : '-';
                const grDisplay = data.gr !== undefined ? parseFloat(Number(data.gr).toFixed(4)) : '-';
            row.innerHTML = `
                <td class="no-export" style="text-align: center;"><input type="checkbox" class="row-checkbox" value="${editandoId}"></td>
                <td>${data.tipoCorte || '-'}</td>
                <td>${data.numProbetas || '-'}</td>
                <td>${anchoDisplay}</td>
                <td>${repeticionDisplay}</td>
                <td>${pesosDisplay}</td>
                <td>${gramajesIndDisplay}</td>
                <td>${grDisplay}</td>
                <td class="no-export">
                    ${window.currentUserRole === 'visor' ? '<span style="color:#888;">Lectura</span>' : `
                    <button class="edit-btn" onclick="editarRegistro('${editandoId}')">Editar</button>
                    <button class="delete-btn" onclick="eliminarRegistro('${editandoId}')">Eliminar</button>
                    `}
                </td>
            `;
        }
        editandoId = null;
        document.querySelector('#gramajeForm button[type="submit"]').textContent = "Añadir Registro";
    } else {
        const docRef = await addDoc(colRef, data);
        renderFila(docRef.id, data);
    }

    esRepeticionActiva = false;
    document.getElementById('badgeRepeticion').style.display = 'none';
    e.target.reset();
    generarInputsPesos(5); // Volver a las 5 casillas originales
    document.getElementById('avisoCorte').style.display = 'none';
    calcularDiferenciaCritica();
    calcularOpcionC();
});

function renderFila(id, data) {
    const row = document.createElement('tr');
    row.id = id;
    const repeticionDisplay = data.esRepeticion ? '<span style="color: #d97706; font-weight: bold;">Sí</span>' : 'No';
    // Damos formato visual para mostrar los pesos separados por comas
    const anchoDisplay = data.anchoEspecimen != null ? Number(data.anchoEspecimen).toFixed(2) + ' mm' : '-';
    const pesosDisplay = data.pesos ? data.pesos.map(p => parseFloat(Number(p).toFixed(4)) + 'g').join(', ') : '-';
    const gramajesIndDisplay = data.gramajesInd ? data.gramajesInd.map(g => parseFloat(Number(g).toFixed(4))).join(', ') : '-';
    const grDisplay = data.gr !== undefined ? parseFloat(Number(data.gr).toFixed(4)) : '-';
    row.innerHTML = `
        <td class="no-export" style="text-align: center;"><input type="checkbox" class="row-checkbox" value="${id}"></td>
        <td>${data.tipoCorte || '-'}</td>
        <td>${data.numProbetas || '-'}</td>
        <td>${anchoDisplay}</td>
        <td>${repeticionDisplay}</td>
        <td>${pesosDisplay}</td>
        <td>${gramajesIndDisplay}</td>
        <td>${grDisplay}</td>
        <td class="no-export">
            ${window.currentUserRole === 'visor' ? '<span style="color:#888;">Lectura</span>' : `
            <button class="edit-btn" onclick="editarRegistro('${id}')">Editar</button>
            <button class="delete-btn" onclick="eliminarRegistro('${id}')">Eliminar</button>
            `}
        </td>
    `;
    document.getElementById('resultadoCuerpo').prepend(row);
}

// Acción para el botón de Repetición (mantiene configuración, limpia pesos)
document.getElementById('btnRepeticion').addEventListener('click', () => {
    editandoId = null;
    esRepeticionActiva = true;
    document.getElementById('badgeRepeticion').style.display = 'inline-block';
    document.querySelector('#gramajeForm button[type="submit"]').textContent = "Añadir Registro";
    
    const inputsPesos = document.querySelectorAll('.peso-probeta');
    inputsPesos.forEach(input => input.value = ''); // Limpiar solo las casillas de los pesos
    
    if(inputsPesos.length > 0) inputsPesos[0].focus(); // Poner el cursor en la primera probeta
    window.scrollTo({ top: 0, behavior: 'smooth' }); // Subir la pantalla hacia el formulario
});

document.getElementById('btnExportar').addEventListener('click', () => {
    const table = document.getElementById('tablaDatos');
    const tempTable = table.cloneNode(true);
    
    // Limpiar columna de acciones para el reporte final
    tempTable.querySelectorAll('.no-export').forEach(el => el.remove());

    const wb = XLSX.utils.table_to_book(tempTable, { sheet: "Data de Gramaje" });
    XLSX.writeFile(wb, `Reporte_CTTC_${new Date().toISOString().split('T')[0]}.xlsx`);
});

// Función global para eliminar
window.eliminarRegistro = async (id) => {
    if(confirm("¿Desea borrar este registro de la base de datos?")) {
        await deleteDoc(doc(db, "gramajes", id));
        document.getElementById(id).remove();
        calcularDiferenciaCritica();
        calcularOpcionC();
    }
};

// Función global para editar
window.editarRegistro = async (id) => {
    const docSnap = await getDoc(doc(db, "gramajes", id));
    if (docSnap.exists()) {
        const data = docSnap.data();
        
        esRepeticionActiva = data.esRepeticion || false;
        document.getElementById('badgeRepeticion').style.display = esRepeticionActiva ? 'inline-block' : 'none';

        document.getElementById('tipoCorte').value = data.tipoCorte;
        document.getElementById('tipoCorte').dispatchEvent(new Event('change')); // Muestra el aviso correcto
        
        document.getElementById('numProbetas').value = data.numProbetas;
        document.getElementById('anchoEspecimen').value = data.anchoEspecimen || '';
        generarInputsPesos(data.numProbetas);
        
        const inputsPesos = document.querySelectorAll('.peso-probeta');
        if (data.pesos) {
            data.pesos.forEach((peso, index) => {
                if(inputsPesos[index]) inputsPesos[index].value = peso;
            });
        }
        
        editandoId = id;
        document.querySelector('#gramajeForm button[type="submit"]').textContent = "Actualizar Registro";
        window.scrollTo({ top: 0, behavior: 'smooth' }); // Llevar la pantalla hacia arriba
    }
};

// --- Lógica de Autenticación (Login / Registro) ---

// Aplicar interfaz según el rol
window.aplicarPermisosVisuales = function(rol) {
    const puedeEditar = (rol === 'admin' || rol === 'analista');
    
    // Ocultar botones de guardado principales y formularios de ingreso
    document.querySelectorAll('.btn-guardar-principal, #btnEliminarSeleccionados, #gramajeForm button[type="submit"], #btnRepeticion').forEach(btn => {
        btn.style.display = puedeEditar ? '' : 'none';
    });

    // Deshabilitar la barra de entrada para no permitir insertar
    const entryBar = document.querySelector('.entry-bar');
    if (entryBar) entryBar.style.display = puedeEditar ? 'block' : 'none';
};

// Monitor del estado de sesión
onAuthStateChanged(auth, async (user) => {
    const authSection = document.getElementById('authSection');
    const appSection = document.getElementById('appSection');
    
    if (user) {
        // Usuario logueado: mostrar app, ocultar login
        if (authSection) authSection.style.display = 'none';
        if (appSection) appSection.style.display = 'block';
        
        try {
            const docSnap = await getDoc(doc(db, "analistas", user.uid));
            if (docSnap.exists() && docSnap.data().rol) {
                window.currentUserRole = docSnap.data().rol;
            } else {
                window.currentUserRole = 'visor';
            }
        } catch (e) {
            window.currentUserRole = 'visor';
        }
        
        const userDisplay = document.getElementById('userDisplay');
        if (userDisplay) userDisplay.textContent = user.email;
        if (userDisplay) userDisplay.innerHTML = `${user.email} <span style="font-size:0.8em; background:#004a8f; color:#fff; padding:3px 8px; border-radius:12px; margin-left:8px; display:inline-block;">Rol: ${window.currentUserRole.toUpperCase()}</span>`;
        
        window.aplicarPermisosVisuales(window.currentUserRole);
    } else {
        // Sin sesión: mostrar login, ocultar app
        if (authSection) authSection.style.display = 'block';
        if (appSection) appSection.style.display = 'none';
        window.currentUserRole = 'visor';
    }
});

// Iniciar Sesión
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPass').value;
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
        alert("Error al iniciar sesión: " + error.message);
    }
});

// Crear Nueva Cuenta y registrar en colección 'analistas'
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('regEmail').value;
    const pass = document.getElementById('regPass').value;
    const nombre = document.getElementById('regNombre').value;
    const cargo = document.getElementById('regCargo').value; // Dato extra de ejemplo
    const rol = document.getElementById('regRol').value;
    
    try {
        // Crear usuario en Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;
        
        // Guardar datos adicionales en Firestore (colección 'analistas')
        await setDoc(doc(db, "analistas", user.uid), {
            email: email,
            nombre: nombre,
            cargo: cargo,
            rol: rol,
            fechaCreacion: new Date().toISOString()
        });
        
        alert("Cuenta de analista creada exitosamente");
    } catch (error) {
        alert("Error al registrar la cuenta: " + error.message);
    }
});

// Cerrar Sesión
document.getElementById('btnLogout')?.addEventListener('click', async () => {
    await signOut(auth);
});

// Alternar entre Login y Registro
document.getElementById('btnShowRegister')?.addEventListener('click', () => {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('registerContainer').style.display = 'block';
});
document.getElementById('btnShowLogin')?.addEventListener('click', () => {
    document.getElementById('registerContainer').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'block';
});

// --- Lógica de la Bandeja de Órdenes de Trabajo ---
function renderOTTray() {
    const otList = document.getElementById('otList');
    otList.innerHTML = '';
    mockOTs.forEach(ot => {
        const div = document.createElement('div');
        div.style = "border: 1px solid #ccc; padding: 15px; cursor: pointer; border-radius: 5px; background: #fff; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: background 0.2s;";
        div.onmouseover = () => div.style.background = '#f9f9f9';
        div.onmouseout = () => div.style.background = '#fff';
        div.innerHTML = `
            <div><strong style="font-size: 1.1em; color: #004a8f;">${ot.id}</strong></div>
            <div><span style="font-weight: bold; color: ${ot.estado === 'Terminado' ? '#217346' : '#d97706'}; background: ${ot.estado === 'Terminado' ? '#e6f4ea' : '#fef3c7'}; padding: 5px 10px; border-radius: 15px; font-size: 0.9em;">${ot.estado}</span></div>
        `;
        div.onclick = () => mostrarMuestras(ot);
        otList.appendChild(div);
    });
}

function mostrarMuestras(ot) {
    currentOT = ot;
    document.getElementById('otTray').style.display = 'none';
    document.getElementById('muestraTray').style.display = 'block';
    document.getElementById('muestraTrayTitle').innerHTML = `Muestras de la OT: <span style="color: #004a8f;">${ot.id}</span>`;
    
    const muestraList = document.getElementById('muestraList');
    muestraList.innerHTML = '';
    ot.muestras.forEach(muestra => {
        const div = document.createElement('div');
        div.style = "border: 1px solid #ccc; padding: 15px; cursor: pointer; border-radius: 5px; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: background 0.2s; font-weight: bold; color: #333;";
        div.onmouseover = () => div.style.background = '#f9f9f9';
        div.onmouseout = () => div.style.background = '#fff';
        div.innerHTML = `📄 ${muestra}`;
        div.onclick = () => seleccionarMuestra(muestra);
        muestraList.appendChild(div);
    });
}

function seleccionarMuestra(muestra) {
    currentMuestra = muestra;
    document.getElementById('muestraTray').style.display = 'none';
    document.getElementById('ensayoTray').style.display = 'block';
    document.getElementById('ensayoTrayTitle').innerHTML = `Ensayos para la Muestra: <span style="color: #004a8f;">${muestra}</span> (OT: ${currentOT.id})`;
    renderEnsayoTray();
}

function renderEnsayoTray() {
    const ensayoList = document.getElementById('ensayoList');
    ensayoList.innerHTML = '';
    mockEnsayos.forEach(ensayo => {
        const div = document.createElement('div');
        div.style = "border: 1px solid #ccc; padding: 15px; cursor: pointer; border-radius: 5px; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: background 0.2s; font-weight: bold; color: #333;";
        div.onmouseover = () => div.style.background = '#f9f9f9';
        div.onmouseout = () => div.style.background = '#fff';
        div.innerHTML = `🔬 ${ensayo}`;
        div.onclick = () => seleccionarEnsayo(ensayo);
        ensayoList.appendChild(div);
    });
}

function seleccionarEnsayo(ensayo) {
    currentEnsayo = ensayo;
    document.getElementById('ensayoTray').style.display = 'none';
    document.getElementById('mainWorkArea').style.display = 'block';
    document.getElementById('currentOtDisplay').innerHTML = `<strong>OT:</strong> ${currentOT.id} &nbsp;|&nbsp; <strong>Muestra:</strong> <span style="color:#004a8f;">${currentMuestra}</span> &nbsp;|&nbsp; <strong>Ensayo:</strong> <span style="color:#004a8f;">${ensayo}</span>`;
    
    // Mostrar el encabezado superior y actualizar el título dinámicamente
    document.getElementById('headerApp').style.display = 'flex';
    document.getElementById('tituloEnsayo').textContent = ensayo;

    if (ensayo === "GRAMAJE ASTM D3776") {
        document.getElementById('toolbarEnsayo').style.display = '';
        document.getElementById('areaGramaje').style.display = 'block';
        document.getElementById('ensayoConstruccion').style.display = 'none';
        cargarDatos();
    } else {
        document.getElementById('toolbarEnsayo').style.display = 'none';
        document.getElementById('areaGramaje').style.display = 'none';
        document.getElementById('ensayoConstruccion').style.display = 'block';
        document.getElementById('resultadoCuerpo').innerHTML = ""; 
    }
}

document.getElementById('btnVolverAOTs').addEventListener('click', () => {
    currentOT = null;
    document.getElementById('muestraTray').style.display = 'none';
    document.getElementById('otTray').style.display = 'block';
});

document.getElementById('btnVolverAMuestras').addEventListener('click', () => {
    currentMuestra = null;
    document.getElementById('ensayoTray').style.display = 'none';
    document.getElementById('muestraTray').style.display = 'block';
});

document.getElementById('btnVolverAEnsayos').addEventListener('click', () => {
    currentEnsayo = null;
    document.getElementById('mainWorkArea').style.display = 'none';
    document.getElementById('headerApp').style.display = 'none';
    document.getElementById('ensayoTray').style.display = 'block';
});

// --- Lógica de Carga de Datos de Incertidumbre ---
async function cargarDatosIncertidumbre() {
    try {
        const docSnap = await getDoc(doc(db, "incertidumbre", "MasaAreaASTM"));
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            if (data.producto) document.getElementById('efiProducto').value = data.producto;
            if (data.fecha) document.getElementById('efiFecha').value = data.fecha;
            if (data.resultados) document.getElementById('efiResultados').value = data.resultados;
            if (data.conclusion) document.getElementById('efiConclusion').value = data.conclusion;
            if (data.elaborado) document.getElementById('efiElaborado').value = data.elaborado;
            if (data.revisado) document.getElementById('efiRevisado').value = data.revisado;
            
            if (data.estConclusionNormalidad) document.getElementById('estConclusionNormalidad').value = data.estConclusionNormalidad;
            if (data.estConclusionVarianzas) document.getElementById('estConclusionVarianzas').value = data.estConclusionVarianzas;
            if (data.estConclusionMedias) document.getElementById('estConclusionMedias').value = data.estConclusionMedias;

            if (data.labExt) {
                if (data.labExt[0]) document.getElementById('labExt1').value = data.labExt[0];
                if (data.labExt[1]) document.getElementById('labExt2').value = data.labExt[1];
                if (data.labExt[2]) document.getElementById('labExt3').value = data.labExt[2];
            }
            if (data.verConclusion) document.getElementById('verConclusion').value = data.verConclusion;
            calcularVeracidad();

            if (data.analistas) {
                ['A1', 'A2', 'A3', 'A4'].forEach(id => {
                    const aData = data.analistas[id];
                    if (aData) {
                        const nombreInput = document.getElementById(`nombre-analista-${id}`);
                        if (nombreInput) nombreInput.value = aData.nombre || '';
                        
                        if (aData.mediciones) {
                            aData.mediciones.forEach(med => {
                                const r = med.repeticion;
                                const inputs = document.querySelectorAll(`.efi-row-${id}-${r}`);
                                if (med.valores) {
                                    inputs.forEach((inp, idx) => {
                                        const v = med.valores[idx];
                                        inp.value = (v !== null && v !== '' && !isNaN(v)) ? parseFloat(v).toFixed(2) : '';
                                    });
                                }
                                const promCell = document.getElementById(`efi-prom-${id}-${r}`);
                                if (promCell) promCell.innerText = med.promedio ? parseFloat(med.promedio).toFixed(2) : '-';
                            });
                        }
                    }
                });
            }
        }
    } catch (error) {
        console.error("Error al cargar datos de incertidumbre: ", error);
    }
}

// --- Lógica de Selección para Incertidumbre ---
function renderIncertidumbreEnsayos() {
    const list = document.getElementById('incertidumbreEnsayoList');
    if (!list) return;
    list.innerHTML = '';
    mockEnsayos.forEach(ensayo => {
        const div = document.createElement('div');
        div.style = "border: 1px solid #ccc; padding: 15px; cursor: pointer; border-radius: 5px; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: background 0.2s; font-weight: bold; color: #333;";
        div.onmouseover = () => div.style.background = '#f9f9f9';
        div.onmouseout = () => div.style.background = '#fff';
        div.innerHTML = `🔬 ${ensayo}`;
        div.onclick = () => {
            const areaEficacia = document.getElementById('areaEficacia');

            if (ensayo === "GRAMAJE ASTM D3776") {
                // Alternar visibilidad si ya está abierto
                if (areaEficacia.style.display === 'block') {
                    areaEficacia.style.display = 'none';
                    div.style.borderLeft = "1px solid #ccc"; // Quitar resaltado
                } else {
                    Array.from(list.children).forEach(child => child.style.borderLeft = "1px solid #ccc");
                    div.style.borderLeft = "4px solid #004a8f"; // Añadir resaltado
                    areaEficacia.style.display = 'block';
                    cargarDatosIncertidumbre();
                }
            } else {
                Array.from(list.children).forEach(child => child.style.borderLeft = "1px solid #ccc");
                div.style.borderLeft = "4px solid #004a8f";
                areaEficacia.style.display = 'none';
            }
        };
        list.appendChild(div);
    });
}

renderOTTray();
renderIncertidumbreEnsayos();
generarTablasEficacia();

// --- Función para Calcular la Prueba de Veracidad (T-Student 2 Muestras) ---
window.calcularVeracidad = function() {
    let cttcData = [];
    for (let a of ['A1', 'A2', 'A3', 'A4']) {
        for (let i = 1; i <= 10; i++) {
            const val = parseFloat(document.getElementById(`efi-prom-${a}-${i}`)?.innerText);
            if (!isNaN(val) && val > 0) cttcData.push(val);
        }
    }
    
    let n1 = cttcData.length;
    if (n1 < 2) return;
    
    if (document.getElementById('verCTTCDataCount')) {
        document.getElementById('verCTTCDataCount').innerText = n1;
    }
    
    let mean1 = cttcData.reduce((a,b)=>a+b, 0) / n1;
    let var1 = cttcData.reduce((a,b)=>a+Math.pow(b-mean1,2), 0) / (n1 - 1);

    let extData = [];
    [1, 2, 3].forEach(i => {
        let val = parseFloat(document.getElementById(`labExt${i}`)?.value);
        if (!isNaN(val)) extData.push(val);
    });
    
    let n2 = extData.length;
    let extPromCell = document.getElementById('labExtProm');
    let mean2 = n2 > 0 ? extData.reduce((a,b)=>a+b, 0) / n2 : 0;
    
    if (extPromCell) {
        extPromCell.innerText = n2 > 0 ? mean2.toFixed(3) : '-';
    }
    
    // --- Actualizar Tabla de Sesgo (Incertidumbre) ---
    let tbodySesgo = document.getElementById('incertidumbreSesgoBody');
    let tbodySesgoEnsayo = document.getElementById('tablaSesgoEnsayoBody');
    if (tbodySesgo) {
        let sesgoHtml = '';
        let sesgoEnsayoHtml = '';
        ['A1', 'A2', 'A3', 'A4'].forEach((a, index) => {
            let sumA = 0; let countA = 0;
            for (let i = 1; i <= 10; i++) {
                const val = parseFloat(document.getElementById(`efi-prom-${a}-${i}`)?.innerText);
                if (!isNaN(val) && val > 0) { sumA += val; countA++; }
            }
            if (countA > 0) {
                let meanA = sumA / countA;
                let refText = n2 > 0 ? mean2.toFixed(3) : '-';
                let sesgoText = n2 > 0 ? Math.abs(meanA - mean2).toFixed(3) : '-';
                sesgoHtml += `<tr><td style="padding: 8px; font-weight: bold;">${a}</td><td style="padding: 8px;">${meanA.toFixed(3)}</td><td style="padding: 8px;">${refText}</td><td style="padding: 8px;">${sesgoText}</td></tr>`;
                
                let selectVal = index === 0 ? 'SI' : 'NO';
                sesgoEnsayoHtml += `<tr>
                    <td style="padding: 8px; font-weight: bold;">${a}</td>
                    <td style="padding: 8px;">
                        <select class="sesgo-ensayo-select" data-analista="${a}" data-sesgo="${sesgoText}" data-media="${meanA.toFixed(3)}" onchange="window.calcularPesosSesgo()">
                            <option value="SI" ${selectVal === 'SI' ? 'selected' : ''}>SI</option>
                            <option value="NO" ${selectVal === 'NO' ? 'selected' : ''}>NO</option>
                        </select>
                    </td>
                    <td style="padding: 8px;">${sesgoText}</td>
                    <td style="padding: 8px;">${meanA.toFixed(3)}</td>
                    <td style="padding: 8px;">${refText}</td>
                    <td style="padding: 8px;" class="sesgo-ensayo-peso" id="sesgo-peso-${a}">0.0000</td>
                </tr>`;
            }
        });
        tbodySesgo.innerHTML = sesgoHtml;
        if (tbodySesgoEnsayo) { tbodySesgoEnsayo.innerHTML = sesgoEnsayoHtml; window.calcularPesosSesgo(); }
    }

    if (n2 < 2) return;
    
    let var2 = extData.reduce((a,b)=>a+Math.pow(b-mean2,2), 0) / (n2 - 1);

    // Prueba T pooled variance (Igualdad de varianzas asumida)
    let s_p_sq = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
    let t = (mean1 - mean2) / Math.sqrt(s_p_sq * (1/n1 + 1/n2));
    let df = n1 + n2 - 2;

    // P-Valor de 2 colas usando la librería jStat
    let p_value = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));

    document.getElementById('verEstT').innerText = t.toFixed(2);
    document.getElementById('verGL').innerText = df;
    document.getElementById('verPvalue').innerText = p_value.toFixed(3);

    const txtConclusion = document.getElementById('verConclusion');
    if (txtConclusion) {
        if (p_value > 0.05) {
            txtConclusion.value = `${p_value.toFixed(3)} (P-value) es mayor que alfa (0.05), se acepta la Ho, no existe diferencia significativa entre los valores obtenidos en CTTC y los valores obtenidos en el Laboratorio Externo, por lo tanto el método de ensayo cumple con el parámetro de veracidad.`;
        } else {
            txtConclusion.value = `${p_value.toFixed(3)} (P-value) es menor o igual a alfa (0.05), se rechaza Ho, entonces el método de ensayo no cumple con la veracidad.`;
        }
    }

    const ctxVeracidad = document.getElementById('graficoVeracidadBoxplot')?.getContext('2d');
    if (ctxVeracidad) {
        if (window.graficoVeracidadChart) window.graficoVeracidadChart.destroy();

        // Plugin personalizado para dibujar la línea y los símbolos de medias (Círculo con Cruz) tipo Minitab
        const connectMeansPlugin = {
            id: 'connectMeans',
            afterDatasetsDraw(chart) {
                try {
                    const ctx = chart.ctx;
                    const meta = chart.getDatasetMeta(0);
                    
                    // Validación estricta para evitar bloqueos durante la renderización
                    if (!meta || !meta.data || meta.data.length < 2) return;
                    
                    const point1 = meta.data[0];
                    const point2 = meta.data[1];
                    
                    const x1 = point1.x;
                    const x2 = point2.x;
                    if (x1 === undefined || x2 === undefined) return;

                    const yAxis = chart.scales.y;
                    if (!yAxis) return;

                    const y1 = yAxis.getPixelForValue(mean1);
                    const y2 = yAxis.getPixelForValue(mean2);
                    if (isNaN(y1) || isNaN(y2)) return;
                    
                    // Dibujar línea de conexión
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.strokeStyle = '#333';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    
                    // Dibujar círculos con cruz para las medias
                    [ {x: x1, y: y1}, {x: x2, y: y2} ].forEach(pt => {
                        ctx.beginPath();
                        ctx.arc(pt.x, pt.y, 6, 0, 2 * Math.PI);
                        ctx.fillStyle = '#004a8f';
                        ctx.fill();
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(pt.x - 4, pt.y);
                        ctx.lineTo(pt.x + 4, pt.y);
                        ctx.moveTo(pt.x, pt.y - 4);
                        ctx.lineTo(pt.x, pt.y + 4);
                        ctx.stroke();
                    });
                    ctx.restore();
                } catch (e) {
                    console.error("No se pudo dibujar las medias conectadas: ", e);
                }
            }
        };
        
        // Calcular límites seguros para el eje Y
        let minValGlobal = Math.min(...cttcData, ...extData, mean1, mean2);
        let maxValGlobal = Math.max(...cttcData, ...extData, mean1, mean2);
        let safeMin = isFinite(minValGlobal) ? Math.floor(minValGlobal) - 0.5 : 215;
        let safeMax = isFinite(maxValGlobal) ? Math.ceil(maxValGlobal) + 0.5 : 219;

        window.graficoVeracidadChart = new Chart(ctxVeracidad, {
            type: 'boxplot',
            data: {
                labels: ['g/m² CTTC', 'g/m² LABT- EXT'],
                datasets: [
                    {
                        label: 'Distribución',
                        backgroundColor: 'rgba(0, 74, 143, 0.3)',
                        borderColor: '#004a8f',
                        borderWidth: 1.5,
                        itemRadius: 0,
                        outlierBackgroundColor: '#c0392b',
                        data: [cttcData, extData],
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        title: { display: true, text: 'Datos' },
                        min: safeMin,
                        max: safeMax
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            },
            plugins: [connectMeansPlugin]
        });
    }
}

document.getElementById('labExt1')?.addEventListener('input', calcularVeracidad);
document.getElementById('labExt2')?.addEventListener('input', calcularVeracidad);
document.getElementById('labExt3')?.addEventListener('input', calcularVeracidad);

window.calcularPesosSesgo = function() {
    const certSacaProm1 = parseFloat(document.getElementById('certSacaProm1')?.value) || 0;
    const selects = document.querySelectorAll('.sesgo-ensayo-select');
    let sumaPesos = 0;
    let usesgoVal = 0;
    let countSI = 0;

    selects.forEach(select => {
        const analista = select.getAttribute('data-analista');
        const sesgo = parseFloat(select.getAttribute('data-sesgo')) || 0;
        const media = parseFloat(select.getAttribute('data-media')) || 0;
        const tdPeso = document.getElementById(`sesgo-peso-${analista}`);
        
        let peso = 0;
        if (select.value === 'SI') {
            peso = media * certSacaProm1;
            usesgoVal += sesgo; 
            countSI++;
        }
        
        if (tdPeso) {
            tdPeso.innerText = peso > 0 ? peso.toFixed(4) : "0.0000";
        }
        sumaPesos += peso;
    });

    let promedioPesos = countSI > 0 ? sumaPesos / countSI : 0;
    let promedioUsesgo = countSI > 0 ? usesgoVal / countSI : 0;

    if (document.getElementById('sumaPesosSesgo')) document.getElementById('sumaPesosSesgo').innerText = promedioPesos.toFixed(4);
    if (document.getElementById('valUsesgo')) document.getElementById('valUsesgo').innerText = promedioUsesgo.toFixed(3);
    if (document.getElementById('gramosBalanzaVal')) document.getElementById('gramosBalanzaVal').innerText = promedioPesos.toFixed(6);

    if (typeof window.actualizarFormulasBalanza === 'function') {
        window.actualizarFormulasBalanza();
    }
    if (typeof window.actualizarFormulasSacabocado === 'function') {
        window.actualizarFormulasSacabocado();
    }
    if (typeof window.calcularUAnalista === 'function') {
        window.calcularUAnalista();
    }
};

document.getElementById('certSacaProm1')?.addEventListener('input', window.calcularPesosSesgo);

// --- Lógica para Sincronizar Certificados (Editable -> Sólo Lectura) ---
window.sincronizarVistaCertificados = function() {
    const syncField = (srcId, targetId) => {
        const src = document.getElementById(srcId);
        const target = document.getElementById(targetId);
        if (src && target) target.innerText = src.value || '-';
    };
    syncField('certBalanzaCodigo', 'viewCertBalanzaCodigo');
    syncField('certBalanzaUR1', 'viewCertBalanzaUR1');
    syncField('certBalanzaUR2', 'viewCertBalanzaUR2');
    syncField('certBalanzaR', 'viewCertBalanzaR');
    syncField('certSacabocadoCodigo', 'viewCertSacabocadoCodigo');
    syncField('certSacaUexp', 'viewCertSacaUexp');
    syncField('certSacaProm1', 'viewCertSacaProm1');
    syncField('certSacaProm2', 'viewCertSacaProm2');
    syncField('certSacaNominal', 'viewCertSacaNominal');

    syncField('precRefText1', 'viewPrecRefText1');
    syncField('precRefVar', 'viewPrecRefVar');
    syncField('precRefText2', 'viewPrecRefText2');
    syncField('precRefStd', 'viewPrecRefStd');
};

['certBalanzaCodigo', 'certBalanzaUR1', 'certBalanzaUR2', 'certBalanzaR', 'certSacabocadoCodigo', 'certSacaUexp', 'certSacaProm1', 'certSacaProm2', 'certSacaNominal', 'precRefText1', 'precRefVar', 'precRefText2', 'precRefStd'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', window.sincronizarVistaCertificados);
});
window.sincronizarVistaCertificados();

window.actualizarFormulasBalanza = function() {
    const ur1 = parseFloat(document.getElementById('certBalanzaUR1')?.value) || 0;
    const ur2 = parseFloat(document.getElementById('certBalanzaUR2')?.value) || 0;
    const rCorregidaCoef = parseFloat(document.getElementById('certBalanzaR')?.value) || 0;
    
    const rVal = parseFloat(document.getElementById('gramosBalanzaVal')?.innerText) || 0;

    const formatScientific = (num) => {
        if (num === 0) return "0";
        let [base, exp] = num.toExponential(2).split('e');
        base = base.replace('.', ',');
        let sign = exp.charAt(0);
        let expNum = exp;
        if (sign === '+' || sign === '-') {
            expNum = exp.substring(1);
        } else {
            sign = '+';
        }
        if (expNum.length === 1) expNum = '0' + expNum;
        let formattedExp = (sign === '-' ? '-' : '+') + expNum;
        if (sign === '+') formattedExp = formattedExp.replace('+', '');
        return `${base}\\text{E}${formattedExp}`;
    };

    const calcRCorregida = rVal - rCorregidaCoef * rVal;
    const calcUR = 2 * Math.sqrt(ur1 + ur2 * Math.pow(calcRCorregida, 2));
    const calcURBase = 2 * Math.sqrt(ur1 + ur2 * Math.pow(0, 2));

    const formatCalcSci = (num) => {
        if (num === 0) return "0";
        let [base, exp] = num.toExponential(4).split('e');
        base = base.replace('.', ',');
        let sign = exp.charAt(0);
        let expNum = exp;
        if (sign === '+' || sign === '-') {
            expNum = exp.substring(1);
        } else {
            sign = '+';
        }
        if (expNum.length === 1) expNum = '0' + expNum;
        let formattedExp = (sign === '-' ? '-' : '+') + expNum;
        if (sign === '+') formattedExp = formattedExp.replace('+', '');
        return `${base}\\text{E}${formattedExp}`;
    };


    const factorCobertura = parseFloat(document.getElementById('factorCoberturaBalanza')?.value) || 1;

    const uEstandarConR = calcUR / factorCobertura;
    const uEstandarSinR = calcURBase / factorCobertura;
    const uGFinal = Math.sqrt(Math.pow(uEstandarConR, 2) + Math.pow(uEstandarSinR, 2));

    const formatCalcTextSci = (num) => {
        if (num === 0) return "0";
        let [base, exp] = num.toExponential(4).split('e');
        base = base.replace('.', ',');
        let sign = exp.charAt(0);
        let expNum = exp;
        if (sign === '+' || sign === '-') expNum = exp.substring(1);
        else sign = '+';
        if (expNum.length === 1) expNum = '0' + expNum;
        let formattedExp = (sign === '-' ? '-' : '+') + expNum;
        if (sign === '+') formattedExp = formattedExp.replace('+', '');
        let decimalStr = num.toFixed(8).replace('.', ',');
        return `${base}E${formattedExp} = ${decimalStr}`;
    };

    const elEstandarConR = document.getElementById('valUestandarConR');
    const elEstandarSinR = document.getElementById('valUestandarSinR');
    const elUgFinal = document.getElementById('valUgFinal');

    if (elEstandarConR) elEstandarConR.innerText = formatCalcTextSci(uEstandarConR);
    if (elEstandarSinR) elEstandarSinR.innerText = formatCalcTextSci(uEstandarSinR);
    if (elUgFinal) elUgFinal.innerText = formatCalcTextSci(uGFinal);

    const containerUR = document.getElementById('formulaURContainer');
    const containerRCorr = document.getElementById('formulaRCorregidaContainer');
    const containerURBase = document.getElementById('formulaURBaseContainer');

    if (containerUR && containerRCorr && containerURBase) {
        containerRCorr.innerHTML = `$$R\\text{ corregida} = ${rVal.toFixed(6).replace('.', ',')} - ${formatScientific(rCorregidaCoef)} \\times ${rVal.toFixed(6).replace('.', ',')} = ${calcRCorregida.toFixed(6).replace('.', ',')}\\text{ g}$$`;
        containerUR.innerHTML = `$$U_R = 2 \\cdot \\sqrt{${formatScientific(ur1)} + ${formatScientific(ur2)} \\times ${calcRCorregida.toFixed(6).replace('.', ',')}^2} = ${formatCalcSci(calcUR)}\\text{ g}$$`;

        containerURBase.innerHTML = `$$U_R = 2 \\cdot \\sqrt{${formatScientific(ur1)} + ${formatScientific(ur2)} \\times 0^2} = ${formatCalcSci(calcURBase)}\\text{ g}$$`;

        if (window.MathJax && MathJax.typesetPromise) {
            MathJax.typesetPromise([containerUR, containerRCorr, containerURBase]).catch((err) => console.error(err.message));
        }
    }

    if (typeof window.calcularResumenMetodo === 'function') {
        window.calcularResumenMetodo();
    }
};

document.getElementById('certBalanzaUR1')?.addEventListener('input', window.actualizarFormulasBalanza);
document.getElementById('certBalanzaUR2')?.addEventListener('input', window.actualizarFormulasBalanza);
document.getElementById('certBalanzaR')?.addEventListener('input', window.actualizarFormulasBalanza);
document.getElementById('factorCoberturaBalanza')?.addEventListener('input', window.actualizarFormulasBalanza);

window.actualizarFactorCoberturaBalanza = function() {
    const codigo = document.getElementById('codigoBalanza')?.value;
    const factorInput = document.getElementById('factorCoberturaBalanza');
    
    if (factorInput) {
        if (codigo === "1") {
            factorInput.value = 2;
        } else if (codigo === "2") {
            factorInput.value = Math.sqrt(3).toFixed(6);
        } else if (codigo === "3") {
            factorInput.value = Math.sqrt(6).toFixed(6);
        } else {
            factorInput.value = 0;
        }
        
        if (typeof window.actualizarFormulasBalanza === 'function') {
            window.actualizarFormulasBalanza();
        }
    }
};

document.getElementById('codigoBalanza')?.addEventListener('input', window.actualizarFactorCoberturaBalanza);

window.actualizarFactorCoberturaSacabocado = function() {
    const codigo = document.getElementById('codigoSacabocado')?.value;
    const factorInput = document.getElementById('factorCoberturaSacabocado');
    
    if (factorInput) {
        if (codigo === "1") {
            factorInput.value = 2;
        } else if (codigo === "2") {
            factorInput.value = Math.sqrt(3).toFixed(6);
        } else if (codigo === "3") {
            factorInput.value = Math.sqrt(6).toFixed(6);
        } else {
            factorInput.value = 0;
        }
        if (typeof window.actualizarFormulasSacabocado === 'function') {
            window.actualizarFormulasSacabocado();
        }
    }
};

document.getElementById('codigoSacabocado')?.addEventListener('input', window.actualizarFactorCoberturaSacabocado);

window.actualizarFormulasSacabocado = function() {
    const certSacaNominal = parseFloat(document.getElementById('certSacaNominal')?.value) || 0;
    const certSacaProm2 = parseFloat(document.getElementById('certSacaProm2')?.value) || 0;
    const certSacaUexp = parseFloat(document.getElementById('certSacaUexp')?.value) || 0;
    const factorCoberturaSaca = parseFloat(document.getElementById('factorCoberturaSacabocado')?.value) || 1;

    // Area Certificado (m²)
    const areaCertificado = certSacaNominal + certSacaProm2;
    
    // U estandar
    const uEstandarSaca = factorCoberturaSaca > 0 ? certSacaUexp / factorCoberturaSaca : 0;
    
    // U (final)
    const uFinalSaca = uEstandarSaca;

    if (document.getElementById('valAreaCertificado')) {
        document.getElementById('valAreaCertificado').innerText = areaCertificado.toFixed(6);
    }
    if (document.getElementById('valUestandarSaca')) {
        document.getElementById('valUestandarSaca').innerText = uEstandarSaca === 0 ? "0.0000E+0" : uEstandarSaca.toExponential(4).toUpperCase();
    }
    if (document.getElementById('valUfinalSaca')) {
        document.getElementById('valUfinalSaca').innerText = uFinalSaca === 0 ? "0.0000E+0" : uFinalSaca.toExponential(4).toUpperCase();
    }

    if (typeof window.calcularResumenMetodo === 'function') {
        window.calcularResumenMetodo();
    }
};

document.getElementById('certSacaNominal')?.addEventListener('input', window.actualizarFormulasSacabocado);
document.getElementById('certSacaProm2')?.addEventListener('input', window.actualizarFormulasSacabocado);
document.getElementById('certSacaUexp')?.addEventListener('input', window.actualizarFormulasSacabocado);
document.getElementById('factorCoberturaSacabocado')?.addEventListener('input', window.actualizarFormulasSacabocado);

window.calcularResumenMetodo = function() {
    const rVal = parseFloat(document.getElementById('gramosBalanzaVal')?.innerText) || 0;
    const rCorregidaCoef = parseFloat(document.getElementById('certBalanzaR')?.value) || 0;
    const calcRCorregida = rVal - rCorregidaCoef * rVal;
    
    const ur1 = parseFloat(document.getElementById('certBalanzaUR1')?.value) || 0;
    const ur2 = parseFloat(document.getElementById('certBalanzaUR2')?.value) || 0;
    const factorCoberturaBalanza = parseFloat(document.getElementById('factorCoberturaBalanza')?.value) || 1;
    
    const calcUR = 2 * Math.sqrt(ur1 + ur2 * Math.pow(calcRCorregida, 2));
    const calcURBase = 2 * Math.sqrt(ur1 + ur2 * Math.pow(0, 2));
    const uEstandarConR = factorCoberturaBalanza > 0 ? calcUR / factorCoberturaBalanza : 0;
    const uEstandarSinR = factorCoberturaBalanza > 0 ? calcURBase / factorCoberturaBalanza : 0;
    const uGFinalBalanza = Math.sqrt(Math.pow(uEstandarConR, 2) + Math.pow(uEstandarSinR, 2));

    const certSacaNominal = parseFloat(document.getElementById('certSacaNominal')?.value) || 0;
    const certSacaProm2 = parseFloat(document.getElementById('certSacaProm2')?.value) || 0;
    const certSacaUexp = parseFloat(document.getElementById('certSacaUexp')?.value) || 0;
    const factorCoberturaSaca = parseFloat(document.getElementById('factorCoberturaSacabocado')?.value) || 1;

    const areaCertificado = certSacaNominal + certSacaProm2;
    const uFinalSaca = factorCoberturaSaca > 0 ? certSacaUexp / factorCoberturaSaca : 0;

    const wVal = calcRCorregida;
    const uxiW = uGFinalBalanza;
    const ciW = areaCertificado > 0 ? 1 / areaCertificado : 0;
    const contribW = Math.pow(uxiW * ciW, 2);

    const aVal = certSacaNominal;
    const uxiA = uFinalSaca;
    const ciA = areaCertificado > 0 ? wVal / Math.pow(areaCertificado, 2) : 0;
    const contribA = Math.pow(uxiA * ciA, 2);

    const u2 = contribW + contribA;
    const u = Math.sqrt(u2);

    const formatN = (num, dec) => num.toFixed(dec);
    
    if (document.getElementById('resW_val')) document.getElementById('resW_val').innerText = formatN(wVal, 3);
    if (document.getElementById('resW_Uxi')) document.getElementById('resW_Uxi').innerText = formatN(uxiW, 4);
    if (document.getElementById('resW_Ci')) document.getElementById('resW_Ci').innerText = formatN(ciW, 3);
    if (document.getElementById('resW_Contrib')) document.getElementById('resW_Contrib').innerText = formatN(contribW, 9);

    if (document.getElementById('resA_val')) document.getElementById('resA_val').innerText = formatN(aVal, 3);
    if (document.getElementById('resA_Uxi')) document.getElementById('resA_Uxi').innerText = formatN(uxiA, 5);
    if (document.getElementById('resA_Ci')) document.getElementById('resA_Ci').innerText = formatN(ciA, 3);
    if (document.getElementById('resA_Contrib')) document.getElementById('resA_Contrib').innerText = formatN(contribA, 4);

    if (document.getElementById('resU2')) document.getElementById('resU2').innerText = formatN(u2, 4);
    if (document.getElementById('resU')) document.getElementById('resU').innerText = formatN(u, 4);

    if (document.getElementById('valUme')) {
        document.getElementById('valUme').innerText = formatN(u, 3); // Este valor va a la vista global
    }
    if (typeof window.calcularIncertidumbreCombinada === 'function') {
        window.calcularIncertidumbreCombinada();
    }
};

window.calcularUAnalista = function() {
    const rows = document.querySelectorAll('.analista-ensayo-row');
    let sumU = 0;
    let countSI = 0;

    rows.forEach(row => {
        const analista = row.getAttribute('data-analista');
        const std = parseFloat(row.getAttribute('data-std')) || 0;
        
        const sesgoSelect = document.querySelector(`.sesgo-ensayo-select[data-analista="${analista}"]`);
        const selectVal = sesgoSelect ? sesgoSelect.value : 'NO';
        
        const tdSiNo = document.getElementById(`analista-sino-${analista}`);
        if (tdSiNo) tdSiNo.innerText = selectVal;
        
        const tdU = document.getElementById(`uanalista-val-${analista}`);
        
        let uVal = 0;
        if (selectVal === 'SI') {
            uVal = std;
            sumU += uVal;
            countSI++;
        }
        
        if (tdU) tdU.innerText = uVal > 0 ? uVal.toFixed(3) : "0.000";
    });

    let promedioU = countSI > 0 ? sumU / countSI : 0;

    if (document.getElementById('valUanalistaTotal')) {
        document.getElementById('valUanalistaTotal').innerText = promedioU.toFixed(3);
    }
    if (typeof window.calcularIncertidumbreCombinada === 'function') {
        window.calcularIncertidumbreCombinada();
    }
};

window.calcularIncertidumbreCombinada = function() {
    const usesgo = parseFloat(document.getElementById('valUsesgo')?.innerText) || 0;
    const uanalista = parseFloat(document.getElementById('valUanalistaTotal')?.innerText) || 0;
    const umed = parseFloat(document.getElementById('valUme')?.innerText) || 0;

    const uc = Math.sqrt(Math.pow(usesgo, 2) + Math.pow(uanalista, 2) + Math.pow(umed, 2));

    if (document.getElementById('valUcUsesgo')) document.getElementById('valUcUsesgo').innerText = usesgo.toFixed(3);
    if (document.getElementById('valUcUanalista')) document.getElementById('valUcUanalista').innerText = uanalista.toFixed(3);
    if (document.getElementById('valUcUMed')) document.getElementById('valUcUMed').innerText = umed.toFixed(4);
    if (document.getElementById('valUcTotal')) document.getElementById('valUcTotal').innerText = uc.toFixed(2) + " g/m²";

    if (typeof window.calcularIncertidumbreExpandida === 'function') {
        window.calcularIncertidumbreExpandida(uc);
    }
};

window.calcularIncertidumbreExpandida = function(uc) {
    // Si no se provee por parámetro, se intenta rescatar del DOM
    if (uc === undefined) {
        const ucText = document.getElementById('valUcTotal')?.innerText || "0";
        uc = parseFloat(ucText.replace(' g/m²', '')) || 0;
    }
    const factor = parseFloat(document.getElementById('factorCoberturaExpandida')?.value) || 2;
    const uex = uc * factor;
    
    // Gramaje = W (Peso con R corregida) / A (Area certificado)
    const rVal = parseFloat(document.getElementById('gramosBalanzaVal')?.innerText) || 0;
    const rCorregidaCoef = parseFloat(document.getElementById('certBalanzaR')?.value) || 0;
    const wVal = rVal - rCorregidaCoef * rVal;

    const certSacaNominal = parseFloat(document.getElementById('certSacaNominal')?.value) || 0;
    const certSacaProm2 = parseFloat(document.getElementById('certSacaProm2')?.value) || 0;
    const areaCertificado = certSacaNominal + certSacaProm2;

    let gramaje = 0;
    if (areaCertificado > 0) {
        gramaje = wVal / areaCertificado;
    }
    
    if (document.getElementById('valUExpandida')) document.getElementById('valUExpandida').innerText = uex.toFixed(3);
    if (document.getElementById('valGramajeExpandida')) document.getElementById('valGramajeExpandida').innerText = gramaje.toFixed(3);
    if (document.getElementById('valUExpandidaFinal')) document.getElementById('valUExpandidaFinal').innerText = uex.toFixed(3);
};

document.getElementById('factorCoberturaExpandida')?.addEventListener('input', () => window.calcularIncertidumbreExpandida());

window.calcularConclusionPrecision = function() {
    let s2r_val = parseFloat(document.getElementById('valS2r')?.innerText) || 0;
    let s2R_val = parseFloat(document.getElementById('valS2R')?.innerText) || 0;
    let s2teo = parseFloat(document.getElementById('precRefVar')?.value) || 0;
    
    if (document.getElementById('concS2r')) {
        document.getElementById('concS2r').innerText = s2r_val.toFixed(3);
        document.getElementById('concS2R').innerText = s2R_val.toFixed(3);
        document.getElementById('concS2Teo').innerText = s2teo.toFixed(3);
        
        let sumatoria = s2r_val + s2R_val;
        let preciso = sumatoria <= s2teo;
        
        if (preciso) {
            document.getElementById('concSigno').innerText = '≤';
            document.getElementById('concResultado').innerText = `La sumatoria de las varianzas experimentales (${sumatoria.toFixed(3)}) es menor o igual a la varianza de la prueba de aptitud, por lo tanto el método es preciso.`;
            document.getElementById('concResultado').style.color = '#217346';
        } else {
            document.getElementById('concSigno').innerText = '>';
            document.getElementById('concResultado').innerText = `La sumatoria de las varianzas experimentales (${sumatoria.toFixed(3)}) es mayor a la varianza de la prueba de aptitud, por lo tanto el método no es preciso.`;
            document.getElementById('concResultado').style.color = '#c0392b';
        }
    }
};

if (!document.getElementById('efiFecha').value) document.getElementById('efiFecha').value = new Date().toISOString().split('T')[0];

// --- Lógica para Generar Evaluación Estadística ---
document.getElementById('btnCalcularEstadistica').addEventListener('click', () => {
    document.getElementById('evaluacionEstadistica').style.display = 'block';
    
    document.getElementById('estProducto').innerText = document.getElementById('efiProducto').value;
    document.getElementById('estFecha').innerText = document.getElementById('efiFecha').value;
    
    const nombres = {
        A1: document.getElementById('nombre-analista-A1')?.value || 'Analista 1',
        A2: document.getElementById('nombre-analista-A2')?.value || 'Analista 2',
        A3: document.getElementById('nombre-analista-A3')?.value || 'Analista 3',
        A4: document.getElementById('nombre-analista-A4')?.value || 'Analista 4'
    };
    
    document.getElementById('estA1').innerText = nombres.A1;
    document.getElementById('estA2').innerText = nombres.A2;
    document.getElementById('estA3').innerText = nombres.A3;
    document.getElementById('estA4').innerText = nombres.A4;
    
    // Rellenar cabeceras de Sección II: Veracidad
    document.getElementById('verProducto').innerText = document.getElementById('efiProducto').value;
    document.getElementById('verFecha').innerText = document.getElementById('efiFecha').value;
    document.getElementById('verCodigoMuestra').innerText = currentMuestra || '-';
    document.getElementById('verA1').innerText = nombres.A1;
    document.getElementById('verA2').innerText = nombres.A2;
    document.getElementById('verA3').innerText = nombres.A3;
    document.getElementById('verA4').innerText = nombres.A4;

    // Rellenar cabeceras de Sección V: Cálculo de Incertidumbre de Factores
    if (document.getElementById('factoresProducto')) {
        document.getElementById('factoresProducto').innerText = document.getElementById('efiProducto').value;
        document.getElementById('factoresFecha').innerText = document.getElementById('efiFecha').value;
        document.getElementById('factoresCodigoMuestra').innerText = currentMuestra || '-';
        document.getElementById('factoresA1').innerText = nombres.A1;
        document.getElementById('factoresA2').innerText = nombres.A2;
        document.getElementById('factoresA3').innerText = nombres.A3;
        document.getElementById('factoresA4').innerText = nombres.A4;
    }

    const promedios = { A1: [], A2: [], A3: [], A4: [] };
    let todosLosDatos = [];
    let tablaResultadosHtml = '';
    
    const getExactMean = (analista, row) => {
        const inputs = document.querySelectorAll(`.efi-row-${analista}-${row}`);
        let sum = 0, count = 0;
        inputs.forEach(inp => {
            const val = parseFloat(inp.value);
            if (!isNaN(val)) { sum += val; count++; }
        });
        return count > 0 ? parseFloat((sum / count).toFixed(4)) : 0; // Redondear a 4 decimales como MINITAB
    };

    for (let i = 1; i <= 10; i++) {
        const p1 = getExactMean('A1', i);
        const p2 = getExactMean('A2', i);
        const p3 = getExactMean('A3', i);
        const p4 = getExactMean('A4', i);
        
        promedios.A1.push(p1); promedios.A2.push(p2); promedios.A3.push(p3); promedios.A4.push(p4);
        
        if(p1 > 0) todosLosDatos.push({val: p1, analista: 'A1'});
        if(p2 > 0) todosLosDatos.push({val: p2, analista: 'A2'});
        if(p3 > 0) todosLosDatos.push({val: p3, analista: 'A3'});
        if(p4 > 0) todosLosDatos.push({val: p4, analista: 'A4'});

        tablaResultadosHtml += `<tr><td style="padding: 5px; font-weight: bold;">${i}</td><td style="padding: 5px;">${p1 > 0 ? p1.toFixed(3) : '-'}</td><td style="padding: 5px;">${p2 > 0 ? p2.toFixed(3) : '-'}</td><td style="padding: 5px;">${p3 > 0 ? p3.toFixed(3) : '-'}</td><td style="padding: 5px;">${p4 > 0 ? p4.toFixed(3) : '-'}</td></tr>`;
    }
    document.getElementById('estResultadosBody').innerHTML = tablaResultadosHtml;

    const n = todosLosDatos.length;
    let sum = 0;
    todosLosDatos.forEach(d => sum += d.val);
    const mean = n > 0 ? sum / n : 0;
    
    let sumSq = 0;
    todosLosDatos.forEach(d => sumSq += Math.pow(d.val - mean, 2));
    const variance = n > 1 ? sumSq / (n - 1) : 0;
    const stdDev = Math.sqrt(variance); // Fórmula poblacional de muestra
    
    document.getElementById('estMediaGlobal').innerText = mean.toFixed(3);
    document.getElementById('estDesvGlobal').innerText = stdDev.toFixed(3);

    if (document.getElementById('precPromGeneral')) {
        document.getElementById('precPromGeneral').innerText = mean.toFixed(4);
        document.getElementById('precDesvGeneral').innerText = stdDev.toFixed(4);
        document.getElementById('precVarGeneral').innerText = variance.toFixed(4);
    }

    // --- Cálculos de Análisis Descriptivo (Por Analista) ---
    let descriptivoHtml = '';
    let incertidumbreAnalistasHtml = '';
    let analistaEnsayoHtml = '';
    let T1 = 0, T2 = 0, T3 = 0, T4 = 0, T5 = 0, pAnalistas = 0;

    ['A1', 'A2', 'A3', 'A4'].forEach((analista, index) => {
        const arr = promedios[analista].filter(v => v > 0);
        let selectVal = index === 0 ? 'SI' : 'NO';
        if (arr.length > 0) {
            const nA = arr.length;
            const sumA = arr.reduce((a, b) => a + b, 0);
            const meanA = sumA / nA;
            
            const sumSqA = arr.reduce((a, b) => a + Math.pow(b - meanA, 2), 0);
            const stdDevA = nA > 1 ? Math.sqrt(sumSqA / (nA - 1)) : 0;
            const varA = nA > 1 ? (sumSqA / (nA - 1)) : 0;
            
            if (nA > 1) {
                pAnalistas++;
                T1 += nA * meanA;
                T2 += nA * Math.pow(meanA, 2);
                T3 += nA;
                T4 += Math.pow(nA, 2);
                T5 += (nA - 1) * varA;
            }

            const minA = Math.min(...arr);
            const maxA = Math.max(...arr);
            
            const sorted = [...arr].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            const medianA = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

            descriptivoHtml += `<tr><td style="padding: 5px; font-weight: bold;">${analista}</td><td style="padding: 5px;">${meanA.toFixed(3)}</td><td style="padding: 5px;">${stdDevA.toFixed(3)}</td><td style="padding: 5px;">${minA.toFixed(3)}</td><td style="padding: 5px;">${medianA.toFixed(3)}</td><td style="padding: 5px;">${maxA.toFixed(3)}</td></tr>`;
            incertidumbreAnalistasHtml += `<tr><td style="padding: 8px; font-weight: bold;">${analista}</td><td style="padding: 8px;">${stdDevA.toFixed(3)}</td></tr>`;
            
            if (document.getElementById(`precProm${analista}`)) {
                document.getElementById(`precProm${analista}`).innerText = meanA.toFixed(4);
                document.getElementById(`precDesv${analista}`).innerText = stdDevA.toFixed(4);
                document.getElementById(`precVar${analista}`).innerText = varA.toFixed(4);
            }
            
            analistaEnsayoHtml += `<tr class="analista-ensayo-row" data-analista="${analista}" data-std="${stdDevA.toFixed(3)}" data-var="${varA.toFixed(3)}">
                <td style="padding: 8px; font-weight: bold;">${analista}</td>
                <td style="padding: 8px;" id="analista-sino-${analista}">${selectVal}</td>
                <td style="padding: 8px;" id="uanalista-val-${analista}">0.000</td>
                <td style="padding: 8px;">${varA.toFixed(3)}</td>
            </tr>`;
        } else {
            descriptivoHtml += `<tr><td style="padding: 5px; font-weight: bold;">${analista}</td><td colspan="5" style="padding: 5px; color: #888;">Sin datos</td></tr>`;
            incertidumbreAnalistasHtml += `<tr><td style="padding: 8px; font-weight: bold;">${analista}</td><td style="padding: 8px; color: #888;">-</td></tr>`;
            
            if (document.getElementById(`precProm${analista}`)) {
                document.getElementById(`precProm${analista}`).innerText = '-';
                document.getElementById(`precDesv${analista}`).innerText = '-';
                document.getElementById(`precVar${analista}`).innerText = '-';
            }
            
            analistaEnsayoHtml += `<tr class="analista-ensayo-row" data-analista="${analista}" data-std="0" data-var="0">
                <td style="padding: 8px; font-weight: bold;">${analista}</td>
                <td style="padding: 8px;" id="analista-sino-${analista}">${selectVal}</td>
                <td style="padding: 8px;" id="uanalista-val-${analista}">0.000</td>
                <td style="padding: 8px;">0.000</td>
            </tr>`;
        }
    });
    document.getElementById('estDescriptivoBody').innerHTML = descriptivoHtml;
    if (document.getElementById('incertidumbreAnalistasBody')) {
        document.getElementById('incertidumbreAnalistasBody').innerHTML = incertidumbreAnalistasHtml;
    }
    if (document.getElementById('tablaAnalistaEnsayoBody')) {
        document.getElementById('tablaAnalistaEnsayoBody').innerHTML = analistaEnsayoHtml;
        window.calcularUAnalista();
    }

    // --- Cálculos de la Sección de Precisión (T1 a T5, Varianza, etc.) ---
    let S2r = 0, S2L = 0, S2R = 0, Sr = 0, SR = 0, lim_r = 0, lim_R = 0;

    if (pAnalistas > 0 && T3 > pAnalistas) {
        S2r = T5 / (T3 - pAnalistas);
        
        let denom1 = T3 * (pAnalistas - 1);
        let denom2 = Math.pow(T3, 2) - T4;
        
        if (denom1 > 0 && denom2 > 0) {
            let part1 = ((T2 * T3 - Math.pow(T1, 2)) / denom1) - S2r;
            let part2 = denom1 / denom2;
            S2L = part1 * part2;
            if (S2L < 0) S2L = 0; // La varianza estimada no puede ser menor a 0
        }
        
        S2R = S2r + S2L;
        Sr = Math.sqrt(S2r);
        SR = Math.sqrt(S2R);
        lim_r = 2.8 * Sr; // 2.8 es el multiplicador estándar ASTM para límites del 95%
        lim_R = 2.8 * SR;
    }

    if (document.getElementById('valT1')) {
        const fPrec = num => num.toFixed(4);
        document.getElementById('valT1').innerText = fPrec(T1);
        document.getElementById('valT2').innerText = fPrec(T2);
        document.getElementById('valT3').innerText = T3;
        document.getElementById('valT4').innerText = T4;
        document.getElementById('valT5').innerText = fPrec(T5);
        
        document.getElementById('valS2r').innerText = fPrec(S2r);
        document.getElementById('valS2L').innerText = fPrec(S2L);
        document.getElementById('valS2R').innerText = fPrec(S2R);
        document.getElementById('valSr').innerText = fPrec(Sr);
        document.getElementById('valSR').innerText = fPrec(SR);
        document.getElementById('valLimR').innerText = fPrec(lim_r);
        document.getElementById('valLimRepro').innerText = fPrec(lim_R);
        
        window.calcularConclusionPrecision();
    }

    let zScoreHtml = '';
    let counter = 1;
    let atipicosCumple = true;
    ['A1', 'A2', 'A3', 'A4'].forEach(analista => {
        promedios[analista].forEach(val => {
            if (val > 0) {
                const z = stdDev > 0 ? (val - mean) / stdDev : 0;
                const absZ = Math.abs(z);
                let calificacion = absZ >= 3 ? 'NO SATISFACTORIO' : (absZ > 2 ? 'CUESTIONABLE' : 'SATISFACTORIO');
                let color = absZ >= 3 ? '#c0392b' : (absZ > 2 ? '#d97706' : '#217346');
                if (absZ >= 3) atipicosCumple = false;
                zScoreHtml += `<tr><td style="padding: 5px;">${counter++}</td><td style="padding: 5px;">${val.toFixed(3)}</td><td style="padding: 5px;">${z.toFixed(3)}</td><td style="padding: 5px;">${absZ.toFixed(3)}</td><td style="padding: 5px; color: ${color}; font-weight: bold;">${calificacion}</td><td style="padding: 5px;">${analista}</td></tr>`;
            }
        });
    });
    document.getElementById('estZscoreBody').innerHTML = zScoreHtml;

    // --- Cálculos de Prueba de Homogeneidad de Varianzas (Bartlett) ---
    let bartlettHtml = '';
    let validGroups = 0, totalN = 0, sumNiMinus1_lnSi2 = 0, sumNiMinus1_Si2 = 0, sum1_NiMinus1 = 0;

    let varianzaLabels = [];
    let varianzaEst = [];
    let varianzaCI = [];

    let kTotal = ['A1', 'A2', 'A3', 'A4'].filter(a => promedios[a].filter(v => v > 0).length > 1).length;
    let alpha = 0.05;
    let indAlpha = kTotal > 0 ? alpha / kTotal : alpha;
    document.getElementById('estBartlettConfLevel').innerText = `Nivel de confianza individual = ${((1 - indAlpha) * 100).toFixed(2)}%`;

    ['A1', 'A2', 'A3', 'A4'].forEach(analista => {
        const arr = promedios[analista].filter(v => v > 0);
        if (arr.length > 1) {
            validGroups++;
            const nA = arr.length, df = nA - 1;
            totalN += nA;
            
            const meanA = arr.reduce((a, b) => a + b, 0) / nA;
            const varA = arr.reduce((a, b) => a + Math.pow(b - meanA, 2), 0) / df;
            
            sumNiMinus1_Si2 += df * varA;
            sumNiMinus1_lnSi2 += df * Math.log(varA);
            sum1_NiMinus1 += 1 / df;
            
            let lowerCI = Math.sqrt((df * varA) / jStat.chisquare.inv(1 - indAlpha / 2, df));
            let upperCI = Math.sqrt((df * varA) / jStat.chisquare.inv(indAlpha / 2, df));
            
            varianzaLabels.push(analista);
            varianzaEst.push(Math.sqrt(varA));
            varianzaCI.push([lowerCI, upperCI]);
            
            bartlettHtml += `<tr><td style="padding: 8px;">${analista}</td><td style="padding: 8px;">${nA}</td><td style="padding: 8px;">${Math.sqrt(varA).toFixed(6)}</td><td style="padding: 8px;">(${lowerCI.toFixed(6)}; ${upperCI.toFixed(6)})</td></tr>`;
        }
    });
    document.getElementById('estBartlettBody').innerHTML = bartlettHtml;

    let homogeneidadCumple = false;
    if (validGroups > 1) {
        let dfTotal = totalN - validGroups, pooledVar = sumNiMinus1_Si2 / dfTotal;
        let bartlettT = (dfTotal * Math.log(pooledVar) - sumNiMinus1_lnSi2) / (1 + (1 / (3 * (validGroups - 1))) * (sum1_NiMinus1 - 1 / dfTotal));
        let bartlettP = 1 - jStat.chisquare.cdf(bartlettT, validGroups - 1);

        document.getElementById('estBartlettT').innerText = bartlettT.toFixed(2);
        document.getElementById('estBartlettP').innerText = bartlettP.toFixed(3);
        
        const bTSide = document.getElementById('estBartlettTSide');
        const bPSide = document.getElementById('estBartlettPSide');
        if (bTSide) bTSide.innerText = bartlettT.toFixed(2);
        if (bPSide) bPSide.innerText = bartlettP.toFixed(3);
        
        homogeneidadCumple = bartlettP > alpha;
        
        // Autocompletar la conclusión de Bartlett evaluando P-Valor
        const txtConclusionVar = document.getElementById('estConclusionVarianzas');
        if (txtConclusionVar) txtConclusionVar.value = `${bartlettP.toFixed(3)} (P valor) es ${bartlettP > alpha ? 'mayor' : 'menor o igual'} que el nivel de significancia (${alpha}) por lo que podemos afirmar, al 95% de confianza, que los analistas ${bartlettP > alpha ? 'tienen similar precisión' : 'presentan diferencia significativa entre sus varianzas'}.`;
    }

    const ctxVarianzas = document.getElementById('graficoVarianzas')?.getContext('2d');
    if (ctxVarianzas) {
        if (window.graficoVarianzasChart) window.graficoVarianzasChart.destroy();
        window.graficoVarianzasChart = new Chart(ctxVarianzas, {
            type: 'bar',
            data: {
                labels: varianzaLabels,
                datasets: [
                    {
                        label: 'Desviación Estándar',
                        data: varianzaEst,
                        type: 'line',
                        showLine: false,
                        backgroundColor: '#c0392b',
                        borderColor: '#c0392b',
                        pointRadius: 6,
                        pointStyle: 'circle'
                    },
                    {
                        label: 'Intervalos de Confianza',
                        data: varianzaCI,
                        backgroundColor: 'rgba(0, 74, 143, 0.4)',
                        borderColor: '#004a8f',
                        borderWidth: 1,
                        barPercentage: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: { title: { display: true, text: 'Desviación Estándar' }, beginAtZero: true }
                },
                plugins: { legend: { display: true } }
            }
        });
    }

    // --- Cálculos de ANOVA (Igualdad de Medias) ---
    let kGroups = validGroups;
    let anovaDFTrt = kGroups - 1;
    let anovaDFE = totalN - kGroups;
    let anovaDFT = totalN - 1;

    let anovaSSTrt = 0;
    let anovaSSE = sumNiMinus1_Si2; 
    let grandMean = mean;
    
    let anovaMediasHtml = '';
    let anovaLabels = [];
    let anovaMeans = [];
    let anovaCIs = [];

    // Aproximación de la inversa T para 95% de confianza
    let tVal = anovaDFE > 0 ? jStat.studentt.inv(0.975, anovaDFE) : 1.96;

    let MSE = anovaDFE > 0 ? anovaSSE / anovaDFE : 0;
    let pooledStd = Math.sqrt(MSE);

    ['A1', 'A2', 'A3', 'A4'].forEach(analista => {
        const arr = promedios[analista].filter(v => v > 0);
        if (arr.length > 0) {
            const nA = arr.length;
            const meanA = arr.reduce((a, b) => a + b, 0) / nA;
            const sumSqA = arr.reduce((a, b) => a + Math.pow(b - meanA, 2), 0);
            const stdA = nA > 1 ? Math.sqrt(sumSqA / (nA - 1)) : 0;

            anovaSSTrt += nA * Math.pow(meanA - grandMean, 2);

            let margin = tVal * (pooledStd / Math.sqrt(nA));
            let lowerCI = meanA - margin;
            let upperCI = meanA + margin;

            const fNum = (num, dec) => num.toFixed(dec).replace('.', ',');
            anovaMediasHtml += `<tr><td style="padding: 8px;">${analista}</td><td style="padding: 8px;">${nA}</td><td style="padding: 8px;">${fNum(meanA, 3)}</td><td style="padding: 8px;">${fNum(stdA, 3)}</td><td style="padding: 8px;">(${fNum(lowerCI, 3)}; ${fNum(upperCI, 3)})</td></tr>`;
            
            anovaLabels.push(analista);
            anovaMeans.push(meanA);
            anovaCIs.push([lowerCI, upperCI]);
        }
    });

    let anovaSST = anovaSSTrt + anovaSSE;
    let MSTrt = anovaDFTrt > 0 ? Math.max(0, anovaSSTrt / anovaDFTrt) : 0;
    let FVal = MSE > 0 ? Math.max(0, MSTrt / MSE) : 0;
    
    let anovaPVal = 1; // Inicializar en 1 (Ho aceptada por defecto si no hay varianza)
    if (FVal >= 0 && anovaDFTrt > 0 && anovaDFE > 0) {
        // Usamos la función Beta Incompleta directamente para el P-Valor (evita bugs de jStat.centralF)
        let x_beta = anovaDFE / (anovaDFE + anovaDFTrt * FVal);
        let p = jStat.ibeta(x_beta, anovaDFE / 2, anovaDFTrt / 2);
        anovaPVal = isNaN(p) ? 1 : Math.max(0, Math.min(1, p)); // Blindaje matemático
    }
    
    let igualdadMediasCumple = anovaPVal > alpha;

    if (document.getElementById('anovaFactorGL')) {
        const formatNumber = (num, decimals) => num.toFixed(decimals).replace('.', ',');

        document.getElementById('anovaFactorGL').innerText = anovaDFTrt;
        document.getElementById('anovaFactorSC').innerText = formatNumber(anovaSSTrt, 4);
        document.getElementById('anovaFactorMC').innerText = formatNumber(MSTrt, 5);
        document.getElementById('anovaFactorF').innerText = formatNumber(FVal, 2);
        document.getElementById('anovaFactorP').innerText = formatNumber(anovaPVal, 3);
        
        document.getElementById('anovaErrorGL').innerText = anovaDFE;
        document.getElementById('anovaErrorSC').innerText = formatNumber(anovaSSE, 4);
        document.getElementById('anovaErrorMC').innerText = formatNumber(MSE, 5);
        
        document.getElementById('anovaTotalGL').innerText = anovaDFT;
        document.getElementById('anovaTotalSC').innerText = formatNumber(anovaSST, 4);
        
        document.getElementById('anovaMediasBody').innerHTML = anovaMediasHtml;
        document.getElementById('anovaDesvAgrupada').innerText = formatNumber(pooledStd, 4);
        
        const txtConclusionMedias = document.getElementById('estConclusionMedias');
        if (txtConclusionMedias) {
            txtConclusionMedias.value = `${anovaPVal.toFixed(3)} (P valor) es ${anovaPVal > alpha ? 'mayor' : 'menor o igual'} que el nivel de significancia (${alpha}) por lo que podemos afirmar, al 95% de confianza, que los resultados de los analistas ${anovaPVal > alpha ? 'son similares respecto a sus medias' : 'presentan diferencia significativa entre sus medias'}.`;
        }

        const ctxIntervalos = document.getElementById('graficoIntervalos')?.getContext('2d');
        if (ctxIntervalos) {
            if (window.graficoIntervalosChart) window.graficoIntervalosChart.destroy();
            window.graficoIntervalosChart = new Chart(ctxIntervalos, {
                type: 'bar',
                data: {
                    labels: anovaLabels,
                    datasets: [
                        {
                            label: 'Media',
                            data: anovaMeans,
                            type: 'line',
                            showLine: false,
                            backgroundColor: '#004a8f',
                            borderColor: '#004a8f',
                            pointRadius: 6,
                            pointStyle: 'circle'
                        },
                        {
                            label: 'Intervalos de Confianza (95%)',
                            data: anovaCIs,
                            backgroundColor: 'rgba(0, 74, 143, 0.2)',
                            borderColor: '#004a8f',
                            borderWidth: 1.5,
                            barPercentage: 0.1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: { 
                            title: { display: true, text: 'Datos' },
                            min: anovaCIs.length > 0 ? Math.floor(Math.min(...anovaCIs.map(ci => ci[0]))) - 0.5 : 0,
                            max: anovaCIs.length > 0 ? Math.ceil(Math.max(...anovaCIs.map(ci => ci[1]))) + 0.5 : 0
                        }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }
    }

    const valoresOrdenados = todosLosDatos.map(d => d.val).sort((a, b) => a - b);
    const nNorm = valoresOrdenados.length;
    
    let estNormMedia = mean;
    let estNormDesv = stdDev;
    
    document.getElementById('estNormMedia').innerText = estNormMedia.toFixed(3);
    document.getElementById('estNormDesv').innerText = estNormDesv.toFixed(4);
    document.getElementById('estNormN').innerText = nNorm;

    let sumAD = 0;
    for (let i = 0; i < nNorm; i++) {
        let x_i = valoresOrdenados[i];
        let x_rev = valoresOrdenados[nNorm - 1 - i];
        let f_i = jStat.normal.cdf(x_i, estNormMedia, estNormDesv);
        let f_rev = jStat.normal.cdf(x_rev, estNormMedia, estNormDesv);
        f_i = Math.max(Math.min(f_i, 0.9999999), 0.0000001);
        f_rev = Math.max(Math.min(f_rev, 0.9999999), 0.0000001);
        sumAD += (2 * (i + 1) - 1) * (Math.log(f_i) + Math.log(1 - f_rev));
    }
    
    let AD = 0;
    let pValueAD = 0;
    if (nNorm > 0) {
        AD = -nNorm - sumAD / nNorm;
        let AD_star = AD * (1 + 0.75 / nNorm + 2.25 / (nNorm * nNorm));
        if (AD_star >= 0.600) pValueAD = Math.exp(1.2937 - 5.709 * AD_star + 0.0186 * Math.pow(AD_star, 2));
        else if (AD_star > 0.340) pValueAD = Math.exp(0.9177 - 4.279 * AD_star - 1.38 * Math.pow(AD_star, 2));
        else if (AD_star > 0.200) pValueAD = 1 - Math.exp(-8.318 + 42.796 * AD_star - 59.938 * Math.pow(AD_star, 2));
        else pValueAD = 1 - Math.exp(-13.436 + 101.14 * AD_star - 223.73 * Math.pow(AD_star, 2));
    }
    
    document.getElementById('estNormAD').innerText = AD.toFixed(3);
    document.getElementById('estNormP').innerText = pValueAD.toFixed(3);

    const txtConclusionNorm = document.getElementById('estConclusionNormalidad');
    if (txtConclusionNorm) {
        if (pValueAD > alpha) {
            txtConclusionNorm.value = `${pValueAD.toFixed(3)} (P valor) es mayor que el nivel de significancia (${alpha}) por lo que podemos afirmar, al 95% de confianza, que los datos SE DISTRIBUYEN NORMALMENTE.`;
        } else {
            txtConclusionNorm.value = `${pValueAD.toFixed(3)} (P valor) es menor o igual que el nivel de significancia (${alpha}) por lo que podemos afirmar, al 95% de confianza, que los datos NO SE DISTRIBUYEN NORMALMENTE.`;
        }
    }

    const normalidadCumple = pValueAD > alpha;

    const setStatus = (id, passes) => {
        const el = document.getElementById(id);
        if (el) {
            if (passes) {
                el.innerHTML = '<span style="font-size: 0.85em; color: #217346; background: #e6f4ea; padding: 2px 8px; border-radius: 12px; border: 1px solid #217346; margin-left: 10px;">✅ CUMPLE</span>';
            } else {
                el.innerHTML = '<span style="font-size: 0.85em; color: #c0392b; background: #fce8e6; padding: 2px 8px; border-radius: 12px; border: 1px solid #c0392b; margin-left: 10px;">❌ NO CUMPLE</span>';
            }
        }
    };

    setStatus('statusNormalidad', normalidadCumple);
    setStatus('statusAtipicos', atipicosCumple);
    setStatus('statusHomogeneidad', homogeneidadCumple);
    setStatus('statusIgualdadMedias', igualdadMediasCumple);

    const generalCumple = normalidadCumple && atipicosCumple && homogeneidadCumple && igualdadMediasCumple;
    const elGeneral = document.getElementById('statusEstadistica');
    if (elGeneral) {
        if (generalCumple) {
            elGeneral.innerHTML = '<span style="font-size: 0.85em; color: #217346; background: #e6f4ea; padding: 2px 10px; border-radius: 12px; border: 1px solid #217346; margin-left: 10px;">✅ APTO</span>';
        } else {
            elGeneral.innerHTML = '<span style="font-size: 0.85em; color: #c0392b; background: #fce8e6; padding: 2px 10px; border-radius: 12px; border: 1px solid #c0392b; margin-left: 10px;">❌ NO APTO</span>';
        }
    }

    const scatterData = valoresOrdenados.map((val, i) => {
        const rank = i + 1;
        const prob = ((rank - 0.5) / nNorm) * 100;
        return { x: val, y: prob };
    });

    const minVal = valoresOrdenados[0] || 215;
    const maxVal = valoresOrdenados[nNorm - 1] || 219;
    const span = maxVal - minVal;
    const lineData = [];
    for (let i = 0; i <= 50; i++) {
        let x = minVal - span * 0.1 + (span * 1.2) * (i / 50);
        let y = jStat.normal.cdf(x, estNormMedia, estNormDesv) * 100;
        lineData.push({ x: x, y: y });
    }

    const ctxNormalidad = document.getElementById('graficoNormalidad').getContext('2d');
    if (window.graficoNormalidadChart) window.graficoNormalidadChart.destroy();
    
    window.graficoNormalidadChart = new Chart(ctxNormalidad, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Distribución Normal Teórica',
                    data: lineData,
                    type: 'line',
                    borderColor: 'red',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.4
                },
                {
                    label: 'Probabilidad vs g/m²',
                    data: scatterData,
                    backgroundColor: '#004a8f',
                    borderColor: '#004a8f'
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: { title: { display: true, text: 'g/m²', font: { weight: 'bold' } } },
                y: { title: { display: true, text: 'Porcentaje', font: { weight: 'bold' } }, min: 1, max: 99 }
            },
            plugins: { legend: { display: true } }
        }
    });

    // Ejecutar prueba de Veracidad
    calcularVeracidad();
});

// Evento para re-calcular conclusión de precisión en tiempo real si el usuario cambia S2 Teórico
document.getElementById('precRefVar')?.addEventListener('input', window.calcularConclusionPrecision);

// --- Lógica de Guardado de Eficacia (Incertidumbre) ---
document.querySelectorAll('.btnGuardarEficacia').forEach(btn => {
    btn.addEventListener('click', async () => {
        const producto = document.getElementById('efiProducto').value;
        const fecha = document.getElementById('efiFecha').value;
        const resultadosText = document.getElementById('efiResultados').value;
        const conclusion = document.getElementById('efiConclusion').value;
        const elaborado = document.getElementById('efiElaborado').value;
        const revisado = document.getElementById('efiRevisado').value;
        
        const estConclusionNormalidad = document.getElementById('estConclusionNormalidad')?.value || '';
        const estConclusionVarianzas = document.getElementById('estConclusionVarianzas')?.value || '';
        const estConclusionMedias = document.getElementById('estConclusionMedias')?.value || '';
        const verConclusion = document.getElementById('verConclusion')?.value || '';
        const labExt = [
            document.getElementById('labExt1')?.value || '',
            document.getElementById('labExt2')?.value || '',
            document.getElementById('labExt3')?.value || ''
        ];

        const analistasData = {};
        ['A1', 'A2', 'A3', 'A4'].forEach(id => {
            const nombreInput = document.getElementById(`nombre-analista-${id}`);
            const nombre = nombreInput ? nombreInput.value : '';
            const mediciones = [];
            for (let i = 1; i <= 10; i++) {
                const inputs = document.querySelectorAll(`.efi-row-${id}-${i}`);
                const rowVals = Array.from(inputs).map(inp => parseFloat(inp.value) || 0);
                const promCell = document.getElementById(`efi-prom-${id}-${i}`);
                const prom = (promCell && promCell.innerText !== '-') ? parseFloat(promCell.innerText) : 0;
                mediciones.push({ repeticion: i, valores: rowVals, promedio: prom });
            }
            analistasData[id] = { nombre, mediciones };
        });

        const data = {
            ensayo: "Masa por Unidad de Area ASTM D3776",
            producto: producto,
            fecha: fecha,
            analistas: analistasData,
            resultados: resultadosText,
            conclusion: conclusion,
            elaborado: elaborado,
            revisado: revisado,
            estConclusionNormalidad: estConclusionNormalidad,
            estConclusionVarianzas: estConclusionVarianzas,
            estConclusionMedias: estConclusionMedias,
            verConclusion: verConclusion,
            labExt: labExt,
            fechaRegistro: new Date().toISOString()
        };

        try {
            await setDoc(doc(db, "incertidumbre", "MasaAreaASTM"), data);
            alert("Registro de incertidumbre guardado exitosamente en la base de datos.");
        } catch (error) {
            console.error("Error al guardar registro de incertidumbre: ", error);
            alert("Error al guardar el registro: " + error.message);
        }
    });
});

// --- Lógica de Selección y Borrado Múltiple para Eficacia ---
let isSelecting = false;

document.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('efi-input')) {
        isSelecting = true;
        if (!e.shiftKey && !e.ctrlKey) {
            document.querySelectorAll('.selected-cell').forEach(el => el.classList.remove('selected-cell'));
        }
        e.target.classList.add('selected-cell');
    } else if (!e.target.closest('#contenedorTablasEficacia')) {
        document.querySelectorAll('.selected-cell').forEach(el => el.classList.remove('selected-cell'));
    }
});

// --- Funciones de Exportación a Word y PDF ---
window.prepareForExport = function() {
    document.querySelectorAll('#areaEficacia input').forEach(el => {
        if (el.type === 'checkbox' || el.type === 'radio') {
            if (el.checked) el.setAttribute('checked', 'checked');
            else el.removeAttribute('checked');
        } else {
            el.setAttribute('value', el.value);
        }
    });
    document.querySelectorAll('#areaEficacia textarea').forEach(el => {
        el.textContent = el.value;
    });
    document.querySelectorAll('#areaEficacia select').forEach(el => {
        const selectedOpt = el.options[el.selectedIndex];
        if(selectedOpt) {
            el.querySelectorAll('option').forEach(opt => opt.removeAttribute('selected'));
            selectedOpt.setAttribute('selected', 'selected');
        }
    });
};

window.exportarAExcel = function() {
    window.prepareForExport();
    const element = document.getElementById('contenedorTablasEficacia').cloneNode(true);
    element.querySelectorAll('button').forEach(btn => btn.remove());
    
    let preHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Eficacia</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>`;
    let postHtml = "</body></html>";
    let html = preHtml + element.innerHTML + postHtml;

    let blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel' });
    let url = URL.createObjectURL(blob);
    let filename = 'Registro_Eficacia_' + new Date().toISOString().split('T')[0] + '.xls';
    
    let downloadLink = document.createElement("a");
    document.body.appendChild(downloadLink);
    downloadLink.href = url;
    downloadLink.download = filename;
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
};

window.exportarAPdf = function() {
    window.prepareForExport();
    const element = document.getElementById('areaEficacia');
    
    const opt = {
        margin: 0.3, 
        filename: 'Registro_Eficacia_' + new Date().toISOString().split('T')[0] + '.pdf',
        image: { type: 'jpeg', quality: 0.98 }, 
        html2canvas: { 
            scale: 2, 
            useCORS: true,
            ignoreElements: (el) => el.tagName && el.tagName.toUpperCase() === 'BUTTON'
        },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(element).save().catch(err => console.error("Error al exportar PDF:", err));
};

document.getElementById('btnExportarExcelTop')?.addEventListener('click', window.exportarAExcel);
document.getElementById('btnExportarPdfTop')?.addEventListener('click', window.exportarAPdf);

document.addEventListener('mouseover', (e) => {
    if (isSelecting && e.target.classList.contains('efi-input')) {
        e.target.classList.add('selected-cell');
    }
});

document.addEventListener('mouseup', () => {
    isSelecting = false;
});

document.addEventListener('copy', (e) => {
    const selectedCells = document.querySelectorAll('.selected-cell');
    
    // Si el usuario sombreó texto en otra parte de la página, respetamos la copia predeterminada
    if (window.getSelection().toString().trim().length > 0 && selectedCells.length <= 1) {
        return;
    }

    if (selectedCells.length > 0) {
        const rows = document.querySelectorAll('#contenedorTablasEficacia tr');
        let copiedRows = [];
        
        rows.forEach(row => {
            const cellsInRow = row.querySelectorAll('.selected-cell');
            if (cellsInRow.length > 0) {
                const rowValues = Array.from(cellsInRow).map(cell => cell.value);
                copiedRows.push(rowValues.join('\t'));
            }
        });
        
        if (copiedRows.length > 0) {
            e.clipboardData.setData('text/plain', copiedRows.join('\n'));
            e.preventDefault();
        }
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedCells = document.querySelectorAll('.selected-cell');
        if (selectedCells.length > 1 || (selectedCells.length === 1 && document.activeElement !== selectedCells[0])) {
            e.preventDefault();
            selectedCells.forEach(cell => {
                cell.value = '';
                cell.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }
    }
});

// --- Lógica de Borrado Masivo para Tabla de Gramajes ---
document.getElementById('selectAllRecords')?.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
    toggleBtnEliminarSeleccionados();
});

document.getElementById('resultadoCuerpo')?.addEventListener('change', (e) => {
    if (e.target.classList.contains('row-checkbox')) {
        toggleBtnEliminarSeleccionados();
        const totalBoxes = document.querySelectorAll('.row-checkbox').length;
        const checkedBoxes = document.querySelectorAll('.row-checkbox:checked').length;
        const selectAll = document.getElementById('selectAllRecords');
        if (selectAll) selectAll.checked = (totalBoxes === checkedBoxes && totalBoxes > 0);
    }
});

function toggleBtnEliminarSeleccionados() {
    const hasChecked = document.querySelectorAll('.row-checkbox:checked').length > 0;
    const btn = document.getElementById('btnEliminarSeleccionados');
    if (btn) btn.style.display = hasChecked ? 'inline-block' : 'none';
}

document.getElementById('btnEliminarSeleccionados')?.addEventListener('click', async () => {
    const checkedBoxes = document.querySelectorAll('.row-checkbox:checked');
    if (checkedBoxes.length > 0 && confirm(`¿Desea borrar permanentemente ${checkedBoxes.length} registro(s)?`)) {
        for (const cb of checkedBoxes) {
            await deleteDoc(doc(db, "gramajes", cb.value));
            document.getElementById(cb.value)?.remove();
        }
        document.getElementById('selectAllRecords').checked = false;
        toggleBtnEliminarSeleccionados();
        calcularDiferenciaCritica();
        calcularOpcionC();
    }
});