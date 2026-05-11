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

const mockEnsayos = [
    "Control de Gramaje y Rendimiento",
    "Solides",
    "Encogimiento"
];

// Simulación de las Órdenes de Trabajo (OT)
const mockOTs = [
    { id: "OT-2026-001", muestras: ["MUE-A100", "MUE-A101"], estado: "Terminado" },
    { id: "OT-2026-002", muestras: ["MUE-B200"], estado: "Terminado" },
    { id: "OT-2026-003", muestras: ["MUE-C300", "MUE-C301", "MUE-C302"], estado: "Pendiente" }
];

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
    });
}

function generarBloqueAnalistasEficacia(id1, id2) {
    let rows = '';
    for (let i = 1; i <= 10; i++) {
        rows += `
        <tr>
            <td style="text-align: center; font-weight: bold; padding: 5px;">${i}</td>
            <td style="padding: 2px;"><input type="number" step="0.0001" class="efi-input efi-row-${id1}-${i}" data-analista="${id1}" data-row="${i}" style="width: 100%; box-sizing: border-box; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 3px;"></td>
            <td style="padding: 2px;"><input type="number" step="0.0001" class="efi-input efi-row-${id1}-${i}" data-analista="${id1}" data-row="${i}" style="width: 100%; box-sizing: border-box; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 3px;"></td>
            <td style="padding: 2px;"><input type="number" step="0.0001" class="efi-input efi-row-${id1}-${i}" data-analista="${id1}" data-row="${i}" style="width: 100%; box-sizing: border-box; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 3px;"></td>
            <td style="background: #eef; font-weight: bold; text-align: center; padding: 5px;" id="efi-prom-${id1}-${i}">-</td>
            <td style="text-align: center; font-weight: bold; border-left: 2px solid #004a8f; padding: 5px;">${i}</td>
            <td style="padding: 2px;"><input type="number" step="0.0001" class="efi-input efi-row-${id2}-${i}" data-analista="${id2}" data-row="${i}" style="width: 100%; box-sizing: border-box; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 3px;"></td>
            <td style="padding: 2px;"><input type="number" step="0.0001" class="efi-input efi-row-${id2}-${i}" data-analista="${id2}" data-row="${i}" style="width: 100%; box-sizing: border-box; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 3px;"></td>
            <td style="padding: 2px;"><input type="number" step="0.0001" class="efi-input efi-row-${id2}-${i}" data-analista="${id2}" data-row="${i}" style="width: 100%; box-sizing: border-box; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 3px;"></td>
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
    cellProm.innerText = count > 0 ? parseFloat((sum / count).toFixed(4)) : '-';
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
                    inputs[j + startColIdx].value = num;
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
                    <button class="edit-btn" onclick="editarRegistro('${editandoId}')">Editar</button>
                    <button class="delete-btn" onclick="eliminarRegistro('${editandoId}')">Eliminar</button>
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
            <button class="edit-btn" onclick="editarRegistro('${id}')">Editar</button>
            <button class="delete-btn" onclick="eliminarRegistro('${id}')">Eliminar</button>
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

// Monitor del estado de sesión
onAuthStateChanged(auth, (user) => {
    const authSection = document.getElementById('authSection');
    const appSection = document.getElementById('appSection');
    
    if (user) {
        // Usuario logueado: mostrar app, ocultar login
        if (authSection) authSection.style.display = 'none';
        if (appSection) appSection.style.display = 'block';
        const userDisplay = document.getElementById('userDisplay');
        if (userDisplay) userDisplay.textContent = user.email;
    } else {
        // Sin sesión: mostrar login, ocultar app
        if (authSection) authSection.style.display = 'block';
        if (appSection) appSection.style.display = 'none';
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
    
    try {
        // Crear usuario en Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;
        
        // Guardar datos adicionales en Firestore (colección 'analistas')
        await setDoc(doc(db, "analistas", user.uid), {
            email: email,
            nombre: nombre,
            cargo: cargo,
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

    if (ensayo === "Control de Gramaje y Rendimiento") {
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
                                        inp.value = med.valores[idx] || '';
                                    });
                                }
                                const promCell = document.getElementById(`efi-prom-${id}-${r}`);
                                if (promCell) promCell.innerText = med.promedio ? med.promedio : '-';
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

            if (ensayo === "Control de Gramaje y Rendimiento") {
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
    if (n2 === 0) {
        if (extPromCell) extPromCell.innerText = '-';
        return;
    }
    let mean2 = extData.reduce((a,b)=>a+b, 0) / n2;
    if (extPromCell) extPromCell.innerText = mean2.toFixed(3);
    
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

    const promedios = { A1: [], A2: [], A3: [], A4: [] };
    let todosLosDatos = [];
    let tablaResultadosHtml = '';
    
    for (let i = 1; i <= 10; i++) {
        const p1 = parseFloat(document.getElementById(`efi-prom-A1-${i}`)?.innerText) || 0;
        const p2 = parseFloat(document.getElementById(`efi-prom-A2-${i}`)?.innerText) || 0;
        const p3 = parseFloat(document.getElementById(`efi-prom-A3-${i}`)?.innerText) || 0;
        const p4 = parseFloat(document.getElementById(`efi-prom-A4-${i}`)?.innerText) || 0;
        
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

    // --- Cálculos de Análisis Descriptivo (Por Analista) ---
    let descriptivoHtml = '';
    ['A1', 'A2', 'A3', 'A4'].forEach(analista => {
        const arr = promedios[analista].filter(v => v > 0);
        if (arr.length > 0) {
            const nA = arr.length;
            const sumA = arr.reduce((a, b) => a + b, 0);
            const meanA = sumA / nA;
            
            const sumSqA = arr.reduce((a, b) => a + Math.pow(b - meanA, 2), 0);
            const stdDevA = nA > 1 ? Math.sqrt(sumSqA / (nA - 1)) : 0;
            
            const minA = Math.min(...arr);
            const maxA = Math.max(...arr);
            
            const sorted = [...arr].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            const medianA = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

            descriptivoHtml += `<tr><td style="padding: 5px; font-weight: bold;">${analista}</td><td style="padding: 5px;">${meanA.toFixed(3)}</td><td style="padding: 5px;">${stdDevA.toFixed(3)}</td><td style="padding: 5px;">${minA.toFixed(3)}</td><td style="padding: 5px;">${medianA.toFixed(3)}</td><td style="padding: 5px;">${maxA.toFixed(3)}</td></tr>`;
        } else {
            descriptivoHtml += `<tr><td style="padding: 5px; font-weight: bold;">${analista}</td><td colspan="5" style="padding: 5px; color: #888;">Sin datos</td></tr>`;
        }
    });
    document.getElementById('estDescriptivoBody').innerHTML = descriptivoHtml;

    let zScoreHtml = '';
    let counter = 1;
    ['A1', 'A2', 'A3', 'A4'].forEach(analista => {
        promedios[analista].forEach(val => {
            if (val > 0) {
                const z = stdDev > 0 ? (val - mean) / stdDev : 0;
                const absZ = Math.abs(z);
                let calificacion = absZ >= 3 ? 'NO SATISFACTORIO' : (absZ > 2 ? 'CUESTIONABLE' : 'SATISFACTORIO');
                let color = absZ >= 3 ? '#c0392b' : (absZ > 2 ? '#d97706' : '#217346');
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

            anovaMediasHtml += `<tr><td style="padding: 8px;">${analista}</td><td style="padding: 8px;">${nA}</td><td style="padding: 8px;">${meanA.toFixed(3)}</td><td style="padding: 8px;">${stdA.toFixed(3)}</td><td style="padding: 8px;">(${lowerCI.toFixed(3)}; ${upperCI.toFixed(3)})</td></tr>`;
            
            anovaLabels.push(analista);
            anovaMeans.push(meanA);
            anovaCIs.push([lowerCI, upperCI]);
        }
    });

    let anovaSST = anovaSSTrt + anovaSSE;
    let MSTrt = anovaDFTrt > 0 ? anovaSSTrt / anovaDFTrt : 0;
    let FVal = MSE > 0 ? MSTrt / MSE : 0;
    
    let anovaPVal = 0;
    if (FVal > 0 && anovaDFTrt > 0 && anovaDFE > 0) {
        anovaPVal = 1 - jStat.centralF.cdf(FVal, anovaDFTrt, anovaDFE);
    }

    if (document.getElementById('anovaFactorGL')) {
        document.getElementById('anovaFactorGL').innerText = anovaDFTrt;
        document.getElementById('anovaFactorSC').innerText = anovaSSTrt.toFixed(4);
        document.getElementById('anovaFactorMC').innerText = MSTrt.toFixed(4);
        document.getElementById('anovaFactorF').innerText = FVal.toFixed(2);
        document.getElementById('anovaFactorP').innerText = anovaPVal.toFixed(3);
        
        document.getElementById('anovaErrorGL').innerText = anovaDFE;
        document.getElementById('anovaErrorSC').innerText = anovaSSE.toFixed(4);
        document.getElementById('anovaErrorMC').innerText = MSE.toFixed(4);
        
        document.getElementById('anovaTotalGL').innerText = anovaDFT;
        document.getElementById('anovaTotalSC').innerText = anovaSST.toFixed(4);
        
        document.getElementById('anovaMediasBody').innerHTML = anovaMediasHtml;
        document.getElementById('anovaDesvAgrupada').innerText = pooledStd.toFixed(4);
        
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
            txtConclusionNorm.value = `Dado que el valor p (${pValueAD.toFixed(3)}) es mayor que el nivel de significancia común (${alpha}), no hay evidencia suficiente para rechazar la hipótesis de que los datos siguen una distribución normal. Los puntos en la gráfica se ajustan razonablemente bien a la línea roja central.`;
        } else {
            txtConclusionNorm.value = `Dado que el valor p (${pValueAD.toFixed(3)}) es menor o igual al nivel de significancia común (${alpha}), hay evidencia para rechazar la hipótesis de que los datos siguen una distribución normal. Los puntos en la gráfica muestran desviaciones importantes respecto a la línea roja central.`;
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

    // --- Gráfico de Campana de Gauss (Histograma + Curva Normal) ---
    // Regla de Sturges para calcular el número de clases (barras) del histograma
    let kBins = Math.ceil(1 + 3.322 * Math.log10(nNorm));
    if (kBins < 5) kBins = 5; // Mínimo 5 barras para visualización decente
    
    let binWidth = span / kBins;
    if (binWidth === 0) binWidth = 1;
    
    let labelsGauss = [];
    let freqGauss = new Array(kBins).fill(0);
    let centersGauss = [];
    
    for (let i = 0; i < kBins; i++) {
        let bMin = minVal + i * binWidth;
        let bMax = minVal + (i + 1) * binWidth;
        centersGauss.push(bMin + binWidth / 2);
        labelsGauss.push(`${bMin.toFixed(2)} - ${bMax.toFixed(2)}`);
    }
    
    valoresOrdenados.forEach(v => {
        let idx = Math.floor((v - minVal) / binWidth);
        if (idx >= kBins) idx = kBins - 1; // Evitar desbordamiento en el valor máximo exacto
        freqGauss[idx]++;
    });
    
    // Calcular la distribución teórica Normal escalada a la frecuencia
    let normalCurveGauss = centersGauss.map(x => {
        let pdf = (1 / (estNormDesv * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - estNormMedia) / estNormDesv, 2));
        return pdf * nNorm * binWidth;
    });
    
    const ctxGauss = document.getElementById('graficoCampanaGauss').getContext('2d');
    if (window.graficoGaussChart) window.graficoGaussChart.destroy();
    
    window.graficoGaussChart = new Chart(ctxGauss, {
        type: 'bar',
        data: {
            labels: labelsGauss,
            datasets: [
                { label: 'Curva Normal Teórica', data: normalCurveGauss, type: 'line', borderColor: '#c0392b', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.4 },
                { label: 'Curva de Datos Reales', data: freqGauss, type: 'line', borderColor: '#d97706', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 4, tension: 0.4, borderDash: [5, 5] },
                { label: 'Frecuencia Real (Barras)', data: freqGauss, backgroundColor: 'rgba(0, 74, 143, 0.6)', borderColor: '#004a8f', borderWidth: 1 }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: { title: { display: true, text: 'Intervalos de g/m²' } },
                y: { title: { display: true, text: 'Frecuencia (Cantidad)' }, beginAtZero: true }
            }
        }
    });
    
    // Ejecutar prueba de Veracidad
    calcularVeracidad();
});

// --- Lógica de Guardado de Eficacia (Incertidumbre) ---
document.getElementById('btnGuardarEficacia').addEventListener('click', async () => {
    const producto = document.getElementById('efiProducto').value;
    const fecha = document.getElementById('efiFecha').value;
    const resultadosText = document.getElementById('efiResultados').value;
    const conclusion = document.getElementById('efiConclusion').value;
    const elaborado = document.getElementById('efiElaborado').value;
    const revisado = document.getElementById('efiRevisado').value;
    
    const estConclusionNormalidad = document.getElementById('estConclusionNormalidad')?.value || '';
    const estConclusionVarianzas = document.getElementById('estConclusionVarianzas')?.value || '';
    const estConclusionMedias = document.getElementById('estConclusionMedias')?.value || '';
    const estConclusionGauss = document.getElementById('estConclusionGauss')?.value || '';
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
        estConclusionGauss: estConclusionGauss,
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

document.addEventListener('mouseover', (e) => {
    if (isSelecting && e.target.classList.contains('efi-input')) {
        e.target.classList.add('selected-cell');
    }
});

document.addEventListener('mouseup', () => {
    isSelecting = false;
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