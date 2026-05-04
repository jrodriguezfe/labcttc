import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
const colRef = collection(db, "gramajes");

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
}

// Generar inputs dinámicos para los pesos
function generarInputsPesos(num) {
    const contenedor = document.getElementById('contenedorPesos');
    contenedor.innerHTML = '';
    for (let i = 1; i <= num; i++) {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.001';
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
        pesos.push(val);
        sumaPesos += val;
        
        // Cálculo individual por cada probeta (Peso / Área)
        const grInd = val / areaCalculada;
        gramajesInd.push(parseFloat(grInd.toFixed(3)));
        sumaGramajes += grInd;
    });

    // Promedio de los gramajes calculados
    const grPromedio = inputsPesos.length > 0 ? (sumaGramajes / inputsPesos.length).toFixed(3) : 0;

    const data = {
        otId: currentOT.id,
        codigoMuestra: currentMuestra,
        esRepeticion: esRepeticionActiva,
        tipoCorte: tipoCorteSeleccionado,
        area: areaCalculada,
        numProbetas: parseInt(document.getElementById('numProbetas').value),
        pesos: pesos,
        gramajesInd: gramajesInd,
        pesoTotal: sumaPesos,
        gr: parseFloat(grPromedio),
        oz: (parseFloat(grPromedio) / 33.906).toFixed(3),
        fecha: new Date().toISOString()
    };

    if (editandoId) {
        await updateDoc(doc(db, "gramajes", editandoId), data);
        const row = document.getElementById(editandoId);
        if (row) {
            const repeticionDisplay = data.esRepeticion ? '<span style="color: #d97706; font-weight: bold;">Sí</span>' : 'No';
            const pesosDisplay = data.pesos ? data.pesos.map(p => Number(p).toFixed(3) + 'g').join(', ') : '-';
            const gramajesIndDisplay = data.gramajesInd ? data.gramajesInd.map(g => Number(g).toFixed(3)).join(', ') : '-';
            const grDisplay = data.gr !== undefined ? Number(data.gr).toFixed(3) : '-';
            const ozDisplay = data.oz !== undefined ? Number(data.oz).toFixed(3) : '-';
            row.innerHTML = `
                <td>${data.tipoCorte || '-'}</td>
                <td>${data.numProbetas || '-'}</td>
                <td>${repeticionDisplay}</td>
                <td>${pesosDisplay}</td>
                <td>${gramajesIndDisplay}</td>
                <td>${grDisplay}</td>
                <td>${ozDisplay}</td>
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
});

function renderFila(id, data) {
    const row = document.createElement('tr');
    row.id = id;
    const repeticionDisplay = data.esRepeticion ? '<span style="color: #d97706; font-weight: bold;">Sí</span>' : 'No';
    // Damos formato visual para mostrar los pesos separados por comas
    const pesosDisplay = data.pesos ? data.pesos.map(p => Number(p).toFixed(3) + 'g').join(', ') : '-';
    const gramajesIndDisplay = data.gramajesInd ? data.gramajesInd.map(g => Number(g).toFixed(3)).join(', ') : '-';
    const grDisplay = data.gr !== undefined ? Number(data.gr).toFixed(3) : '-';
    const ozDisplay = data.oz !== undefined ? Number(data.oz).toFixed(3) : '-';
    row.innerHTML = `
        <td>${data.tipoCorte || '-'}</td>
        <td>${data.numProbetas || '-'}</td>
        <td>${repeticionDisplay}</td>
        <td>${pesosDisplay}</td>
        <td>${gramajesIndDisplay}</td>
        <td>${grDisplay}</td>
        <td>${ozDisplay}</td>
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
    
    if (ensayo === "Control de Gramaje y Rendimiento") {
        document.getElementById('areaGramaje').style.display = 'block';
        document.getElementById('ensayoConstruccion').style.display = 'none';
        cargarDatos();
    } else {
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
    document.getElementById('ensayoTray').style.display = 'block';
});

renderOTTray();