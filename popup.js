// popup.js
// Firebase SDK Imports (These are already handled by the HTML script tag type="module")
// import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
// import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
// import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global variables provided by Canvas environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
// Hardcode the firebaseConfig directly to ensure it's always available
const firebaseConfig = {
    apiKey: "AIzaSyBYylqDPYa8r9tV39CglgidwfUpllbdFmE",
    authDomain: "liquid-glass-app.firebaseapp.com",
    projectId: "liquid-glass-app",
    storageBucket: "liquid-glass-app.firebasestorage.app",
    messagingSenderId: "218581138148",
    appId: "1:218581138148:web:ec8b61a2c7abf186ec0af1",
    measurementId: "G-CC4XC2R4D2"
};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Firebase App and Services
let app;
let db;
let auth;
let userId = 'N/A'; // Default until authenticated
let isAuthReady = false; // Flag to indicate Firebase auth is ready

// --- DOM Elements ---
const unlockScreen = document.getElementById('unlock-screen');
const vaultScreen = document.getElementById('vault-screen');
const masterPasswordInput = document.getElementById('masterPasswordInput');
const unlockVaultButton = document.getElementById('unlockVaultButton');
const setMasterPasswordButton = document.getElementById('setMasterPasswordButton');
const showHintButton = document.getElementById('showHintButton');
const forgotPasswordLink = document.getElementById('forgotPasswordLink');
const unlockMessage = document.getElementById('unlockMessage');

const setMasterPasswordForm = document.getElementById('set-master-password-form');
const setPasswordTitle = document.getElementById('set-password-title');
const setPasswordIntro = document.getElementById('set-password-intro');
const newMasterPasswordInput = document.getElementById('newMasterPassword');
const confirmNewMasterPasswordInput = document.getElementById('confirmNewMasterPassword');
const passwordHintInput = document.getElementById('passwordHint');
const confirmSetPasswordButton = document.getElementById('confirmSetPasswordButton');
const cancelSetPasswordButton = document.getElementById('cancelSetPasswordButton');
const setPasswordMessage = document.getElementById('setPasswordMessage');

const forgotPasswordScreen = document.getElementById('forgot-password-screen');
const recoveryCodeInput = document.getElementById('recoveryCodeInput');
const submitRecoveryCodeButton = document.getElementById('submitRecoveryCodeButton');
const cancelResetButton = document.getElementById('cancelResetButton');
const resetMessage = document.getElementById('resetMessage');

const addNewItemButton = document.getElementById('addNewItemButton');
const generateRecoveryCodeButton = document.getElementById('generateRecoveryCodeButton');
const lockVaultButton = document.getElementById('lockVaultButton');
const vaultItemsList = document.getElementById('vault-items-list');
const noItemsMessage = document.getElementById('no-items-message');

const itemForm = document.getElementById('item-form');
const formTitle = document.getElementById('form-title');
const itemIdInput = document.getElementById('itemId');
const itemNameInput = document.getElementById('itemName');
const itemTypeInput = document.getElementById('itemType');
const itemValueInput = document.getElementById('itemValue');
const itemNotesInput = document.getElementById('itemNotes');
const saveItemButton = document.getElementById('saveItemButton');
const cancelItemButton = document.getElementById('cancelItemButton');
const itemFormMessage = document.getElementById('itemFormMessage');

const connectionStatusSpan = document.getElementById('connectionStatus');
const displayUserIdSpan = document.getElementById('displayUserId');

// --- Global Variables ---
let encryptionKey = null; // Stored in memory after successful unlock
let vaultData = []; // Decrypted vault data, stored in memory
const VAULT_DOC_PATH = `artifacts/${appId}/users`; // Base path for user-specific vault document
const SALT_LENGTH = 16; // 128-bit salt
const IV_LENGTH = 12;   // 96-bit IV for AES-GCM
const ITERATIONS = 100000; // PBKDF2 iterations
const KEY_LENGTH = 256; // 256-bit key for AES-GCM

// --- Firebase Initialization and Authentication ---
async function initializeFirebase() {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);

        connectionStatusSpan.textContent = 'Authenticating...';

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                displayUserIdSpan.textContent = userId;
                connectionStatusSpan.textContent = 'Connected';
                isAuthReady = true;
                console.log("Firebase authenticated. User ID:", userId);
                // Now that auth is ready, proceed with UI initialization
                await initializeUI();
            } else {
                // Sign in anonymously if no token is provided or user logs out
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }
            }
        });
    } catch (error) {
        console.error("Error initializing Firebase:", error);
        connectionStatusSpan.textContent = 'Connection Error';
        showMessage(unlockMessage, "Failed to connect to database. Check console for details.", "error");
    }
}

// --- Utility Functions (same as before) ---
function showMessage(element, msg, type) {
    element.textContent = msg;
    element.className = `message ${type}`;
    element.style.display = 'block';
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary_string = atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

async function deriveKey(masterPassword, salt) {
    const passwordBuffer = new TextEncoder().encode(masterPassword);
    const baseKey = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: ITERATIONS,
            hash: 'SHA-256',
        },
        baseKey,
        { name: 'AES-GCM', length: KEY_LENGTH },
        true,
        ['encrypt', 'decrypt']
    );
}

async function encryptData(plaintext, key) {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertextBuffer = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv,
        },
        key,
        encoded
    );

    return {
        ciphertext: arrayBufferToBase64(ciphertextBuffer),
        iv: arrayBufferToBase64(iv)
    };
}

async function decryptData(ciphertextBase64, ivBase64, key) {
    try {
        const ciphertext = base64ToArrayBuffer(ciphertextBase64);
        const iv = base64ToArrayBuffer(ivBase64);

        const decryptedBuffer = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv,
            },
            key,
            ciphertext
        );
        return new TextDecoder().decode(decryptedBuffer);
    } catch (e) {
        console.error('Decryption failed:', e);
        return null;
    }
}

// --- Vault Management Functions (Updated for Firestore) ---

/**
 * Gets the Firestore document reference for the current user's vault.
 */
function getUserVaultDocRef() {
    if (!userId || !db) {
        console.error("Firebase not initialized or user not authenticated.");
        return null;
    }
    return doc(db, VAULT_DOC_PATH, userId, 'guardianKeyVault', 'data');
}

/**
 * Saves the current encrypted vault data and hint to Firestore.
 */
async function saveVaultToFirestore(hint = null) {
    if (!encryptionKey) {
        console.error("No encryption key available to save vault.");
        showMessage(itemFormMessage, "Error: Vault not unlocked.", "error");
        return false;
    }

    const vaultDocRef = getUserVaultDocRef();
    if (!vaultDocRef) return false;

    try {
        const plaintextVault = JSON.stringify(vaultData);
        const { ciphertext, iv } = await encryptData(plaintextVault, encryptionKey);

        let vaultSalt;
        const docSnap = await getDoc(vaultDocRef);
        if (docSnap.exists() && docSnap.data().salt) {
            vaultSalt = docSnap.data().salt;
        } else {
            // Generate new salt if it's the first save or if salt is missing
            vaultSalt = arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(SALT_LENGTH)));
            console.warn("No salt found in Firestore, generating a new one.");
        }

        const dataToSave = {
            encryptedData: ciphertext,
            iv: iv,
            salt: vaultSalt,
            masterPasswordHint: hint !== null ? hint : (docSnap.exists() ? docSnap.data().masterPasswordHint : '') // Preserve existing hint if not updated
        };

        await setDoc(vaultDocRef, dataToSave, { merge: true }); // Use merge to avoid overwriting other fields
        console.log("Vault saved to Firestore successfully.");
        return true;
    } catch (error) {
        console.error("Failed to save vault to Firestore:", error);
        showMessage(itemFormMessage, "Error saving vault data to database.", "error");
        return false;
    }
}

/**
 * Loads and decrypts vault data from Firestore.
 * @param {string} masterPassword The master password entered by the user.
 * @returns {Promise<boolean>} True if unlock successful, false otherwise.
 */
async function unlockVault(masterPassword) {
    unlockMessage.textContent = '';
    unlockMessage.style.display = 'none';

    const vaultDocRef = getUserVaultDocRef();
    if (!vaultDocRef) {
        showMessage(unlockMessage, "Database not ready. Please wait.", "error");
        return false;
    }

    try {
        const docSnap = await getDoc(vaultDocRef);

        let vaultSalt;
        if (docSnap.exists() && docSnap.data().salt) {
            vaultSalt = base64ToArrayBuffer(docSnap.data().salt);
        } else {
            showMessage(unlockMessage, "No vault data found. Please set a master password first.", "error");
            return false;
        }

        const key = await deriveKey(masterPassword, vaultSalt);
        encryptionKey = key;

        if (docSnap.exists() && docSnap.data().encryptedData && docSnap.data().iv) {
            const decryptedText = await decryptData(docSnap.data().encryptedData, docSnap.data().iv, encryptionKey);
            if (decryptedText === null) {
                throw new Error("Decryption failed. Incorrect password.");
            }
            vaultData = JSON.parse(decryptedText);
            console.log("Vault unlocked successfully.");
            showMessage(unlockMessage, "Vault unlocked successfully!", "success");
            displayVault();
            return true;
        } else {
            vaultData = [];
            console.log("Vault unlocked. No items found yet.");
            showMessage(unlockMessage, "Vault unlocked. No items found yet. Add your first item!", "success");
            displayVault();
            return true;
        }
    } catch (error) {
        console.error("Unlock failed:", error);
        showMessage(unlockMessage, "Incorrect Master Password or vault data corrupted.", "error");
        encryptionKey = null;
        vaultData = [];
        return false;
    }
}

/**
 * Sets the master password for the first time or resets it.
 * This will re-encrypt all existing data with the new password.
 * @param {string} masterPassword
 * @param {string} hint
 * @param {boolean} isResetting If true, indicates a reset operation (clears old recovery code).
 */
async function setMasterPassword(masterPassword, hint, isResetting = false) {
    setPasswordMessage.textContent = '';
    setPasswordMessage.style.display = 'none';

    if (!masterPassword) {
        showMessage(setPasswordMessage, "Master password cannot be empty.", "error");
        return false;
    }
    if (masterPassword !== confirmNewMasterPasswordInput.value) {
        showMessage(setPasswordMessage, "Passwords do not match.", "error");
        return false;
    }

    const vaultDocRef = getUserVaultDocRef();
    if (!vaultDocRef) {
        showMessage(setPasswordMessage, "Database not ready. Please wait.", "error");
        return false;
    }

    // Generate a new salt for the new master password
    const newSalt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const newSaltBase64 = arrayBufferToBase64(newSalt);

    try {
        const newKey = await deriveKey(masterPassword, newSalt);
        encryptionKey = newKey;

        const plaintextVault = JSON.stringify(vaultData); // vaultData will be empty if it's a reset
        const { ciphertext, iv } = await encryptData(plaintextVault, encryptionKey);

        const dataToSet = {
            encryptedData: ciphertext,
            iv: iv,
            salt: newSaltBase64,
            masterPasswordHint: hint
        };

        // If resetting, clear the old recovery code from Firestore
        if (isResetting) {
            dataToSet.recoveryCode = deleteDoc; // Special value to delete the field
            console.log("Old recovery code marked for deletion after reset.");
        }

        await setDoc(vaultDocRef, dataToSet, { merge: true }); // Use merge for hint/recovery code
        console.log("Master password set/updated successfully in Firestore.");
        showMessage(setPasswordMessage, "Master password set! Vault is now unlocked.", "success");
        hideSetMasterPasswordForm();
        displayVault();
        return true;
    } catch (error) {
        console.error("Failed to set master password in Firestore:", error);
        showMessage(setPasswordMessage, "Failed to set master password. Please try again.", "error");
        encryptionKey = null;
        return false;
    }
}

/**
 * Locks the vault, clearing sensitive data from memory and returning to unlock screen.
 */
function lockVault() {
    encryptionKey = null;
    vaultData = [];
    masterPasswordInput.value = '';
    masterPasswordInput.focus();
    unlockScreen.style.display = 'block';
    vaultScreen.style.display = 'none';
    itemForm.style.display = 'none';
    vaultItemsList.innerHTML = '';
    console.log("Vault locked.");
}

/**
 * Renders the list of vault items.
 */
function displayVault() {
    unlockScreen.style.display = 'none';
    setMasterPasswordForm.style.display = 'none';
    forgotPasswordScreen.style.display = 'none';
    vaultScreen.style.display = 'block';
    vaultItemsList.innerHTML = '';

    if (vaultData.length === 0) {
        noItemsMessage.style.display = 'block';
        vaultItemsList.appendChild(noItemsMessage);
    } else {
        noItemsMessage.style.display = 'none';
        vaultData.forEach(item => {
            const li = document.createElement('li');
            li.className = 'vault-item';
            li.dataset.id = item.id;
            li.innerHTML = `
                <div class="vault-item-header">
                    <span>${escapeHTML(item.name)} (${escapeHTML(item.type)})</span>
                    <div class="vault-item-actions">
                        <button class="copy-button" data-value="${escapeHTML(item.value)}" title="Copy Value">
                            <svg class="icon icon-copy" viewBox="0 0 24 24">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            Copy
                        </button>
                        <button class="view-button" data-id="${item.id}" title="View/Hide Value">
                            <svg class="icon icon-eye" viewBox="0 0 24 24">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            View
                        </button>
                        <button class="edit-button" data-id="${item.id}" title="Edit Item">
                            <svg class="icon icon-edit" viewBox="0 0 24 24">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                            Edit
                        </button>
                        <button class="delete-button red" data-id="${item.id}" title="Delete Item">
                            <svg class="icon icon-trash" viewBox="0 0 24 24">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                            Delete
                        </button>
                    </div>
                </div>
                <div class="vault-item-details">
                    <strong>Value:</strong> <span class="item-display-value" data-id="${item.id}">••••••••</span>
                </div>
                ${item.notes ? `<div class="vault-item-details"><strong>Notes:</strong> ${escapeHTML(item.notes)}</div>` : ''}
            `;
            vaultItemsList.appendChild(li);
        });
    }
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

function showItemForm(itemData = null) {
    itemForm.style.display = 'block';
    itemFormMessage.style.display = 'none';

    if (itemData) {
        formTitle.textContent = 'Edit Item';
        itemIdInput.value = itemData.id;
        itemNameInput.value = itemData.name;
        itemTypeInput.value = itemData.type;
        itemValueInput.value = itemData.value;
        itemNotesInput.value = itemData.notes || '';
    } else {
        formTitle.textContent = 'Add New Item';
        itemIdInput.value = '';
        itemNameInput.value = '';
        itemTypeInput.value = '';
        itemValueInput.value = '';
        itemNotesInput.value = '';
    }
}

function hideItemForm() {
    itemForm.style.display = 'none';
    itemFormMessage.style.display = 'none';
}

function showSetMasterPasswordForm(isReset = false) {
    unlockScreen.style.display = 'none';
    vaultScreen.style.display = 'none';
    forgotPasswordScreen.style.display = 'none';
    setMasterPasswordForm.style.display = 'block';
    setPasswordMessage.style.display = 'none';

    newMasterPasswordInput.value = '';
    confirmNewMasterPasswordInput.value = '';
    passwordHintInput.value = '';

    if (isReset) {
        setPasswordTitle.textContent = 'Set New Master Password';
        setPasswordIntro.textContent = 'Enter a new master password for your NEW, EMPTY vault. Your old data cannot be recovered.';
    } else {
        setPasswordTitle.textContent = 'Set Master Password';
        setPasswordIntro.textContent = 'This will be your primary password to access GuardianKey. Choose a strong, unique one.';
        // Load existing hint if it exists for editing
        const vaultDocRef = getUserVaultDocRef();
        if (vaultDocRef) {
            getDoc(vaultDocRef).then(docSnap => {
                if (docSnap.exists() && docSnap.data().masterPasswordHint) {
                    passwordHintInput.value = docSnap.data().masterPasswordHint;
                }
            }).catch(e => console.error("Error loading hint:", e));
        }
    }
}

function hideSetMasterPasswordForm() {
    setMasterPasswordForm.style.display = 'none';
    setPasswordMessage.style.display = 'none';
    if (encryptionKey) {
        displayVault();
    } else {
        unlockScreen.style.display = 'block';
    }
}

function showForgotPasswordScreen() {
    unlockScreen.style.display = 'none';
    setMasterPasswordForm.style.display = 'none';
    vaultScreen.style.display = 'none';
    forgotPasswordScreen.style.display = 'block';
    resetMessage.style.display = 'none';
    recoveryCodeInput.value = '';
}

function hideForgotPasswordScreen() {
    forgotPasswordScreen.style.display = 'none';
    resetMessage.style.display = 'none';
    unlockScreen.style.display = 'block';
}

async function saveItem() {
    const id = itemIdInput.value || crypto.randomUUID();
    const name = itemNameInput.value.trim();
    const type = itemTypeInput.value.trim();
    const value = itemValueInput.value;
    const notes = itemNotesInput.value.trim();

    if (!name || !type) {
        showMessage(itemFormMessage, "Name and Type are required.", "error");
        return;
    }

    const newItem = { id, name, type, value, notes };

    const existingIndex = vaultData.findIndex(item => item.id === id);
    if (existingIndex > -1) {
        vaultData[existingIndex] = newItem;
        showMessage(itemFormMessage, "Item updated successfully!", "success");
    } else {
        vaultData.push(newItem);
        showMessage(itemFormMessage, "Item added successfully!", "success");
    }

    const saved = await saveVaultToFirestore();
    if (saved) {
        hideItemForm();
        displayVault();
    }
}

async function deleteItem(id) {
    if (!confirm("Are you sure you want to delete this item? This action cannot be undone.")) {
        return;
    }
    vaultData = vaultData.filter(item => item.id !== id);
    const saved = await saveVaultToFirestore();
    if (saved) {
        displayVault();
        showMessage(unlockMessage, "Item deleted successfully.", "success");
    }
}

function toggleItemVisibility(id, button) {
    const item = vaultData.find(i => i.id === id);
    if (!item) return;

    const displayValueSpan = document.querySelector(`.vault-item[data-id="${id}"] .item-display-value`);
    if (!displayValueSpan) return;

    if (displayValueSpan.textContent === '••••••••') {
        displayValueSpan.textContent = item.value;
        button.innerHTML = `
            <svg class="icon icon-eye-off" viewBox="0 0 24 24">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.54 18.54 0 0 1 2.16-3.15m6.86-1.04A2 2 0 0 0 12 10a2 2 0 0 0-2 2"></path>
                <path d="M1 1l22 22"></path>
                <path d="M12 4s7 8 11 8a18.54 18.54 0 0 1-2.16 3.15"></path>
                <path d="M15 15.77a2 2 0 0 1-3.93-1.42"></path>
            </svg>
            Hide
        `;
    } else {
        displayValueSpan.textContent = '••••••••';
        button.innerHTML = `
            <svg class="icon icon-eye" viewBox="0 0 24 24">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>
            View
        `;
    }
}

function copyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        showMessage(unlockMessage, "Copied to clipboard!", "success");
    } catch (err) {
        console.error('Failed to copy text: ', err);
        showMessage(unlockMessage, "Failed to copy to clipboard.", "error");
    }
    document.body.removeChild(textarea);
}

async function generateRecoveryCode() {
    if (!confirm("WARNING: Generating a recovery code creates a way to reset your master password, but it WILL NOT recover your encrypted data if you forget your master password. This code must be stored EXTREMELY securely and OFFLINE. It is single-use. Continue?")) {
        return;
    }

    const newRecoveryCode = crypto.randomUUID();
    const vaultDocRef = getUserVaultDocRef();
    if (!vaultDocRef) return;

    try {
        await updateDoc(vaultDocRef, { recoveryCode: newRecoveryCode });
        alert(`Your new recovery code is:

${newRecoveryCode}

STORE THIS SECURELY OFFLINE! It is single-use.`);
        showMessage(unlockMessage, "Recovery code generated and stored. Please save it securely!", "warning");
    }
    catch (error) {
        console.error("Failed to generate recovery code:", error);
        showMessage(unlockMessage, "Failed to generate recovery code.", "error");
    }
}

async function resetMasterPasswordWithCode() {
    resetMessage.textContent = '';
    resetMessage.style.display = 'none';

    const enteredCode = recoveryCodeInput.value.trim();
    const vaultDocRef = getUserVaultDocRef();
    if (!vaultDocRef) {
        showMessage(resetMessage, "Database not ready. Please wait.", "error");
        return;
    }

    try {
        const docSnap = await getDoc(vaultDocRef);
        const storedRecoveryCode = docSnap.exists() ? docSnap.data().recoveryCode : null;

        if (!storedRecoveryCode) {
            showMessage(resetMessage, "No recovery code has been set for this vault.", "error");
            return;
        }

        if (enteredCode !== storedRecoveryCode) {
            showMessage(resetMessage, "Invalid recovery code.", "error");
            return;
        }

        // If code matches, allow setting new master password for an empty vault
        vaultData = []; // Ensure vault is empty for reset
        encryptionKey = null; // Clear old key
        hideForgotPasswordScreen();
        showSetMasterPasswordForm(true); // Indicate this is a reset operation
    } catch (error) {
        console.error("Error verifying recovery code:", error);
        showMessage(resetMessage, "Error verifying recovery code. Please try again.", "error");
    }
}

// --- Event Listeners ---

unlockVaultButton.addEventListener('click', async () => {
    const masterPassword = masterPasswordInput.value;
    if (masterPassword) {
        await unlockVault(masterPassword);
    } else {
        showMessage(unlockMessage, "Please enter your master password.", "error");
    }
});

setMasterPasswordButton.addEventListener('click', async () => {
    showSetMasterPasswordForm(false);
});

confirmSetPasswordButton.addEventListener('click', async () => {
    const masterPassword = newMasterPasswordInput.value;
    const hint = passwordHintInput.value.trim();
    const isReset = setPasswordTitle.textContent === 'Set New Master Password';

    const success = await setMasterPassword(masterPassword, hint, isReset);
    if (success && isReset) {
        showMessage(unlockMessage, "Master password reset successfully! Your vault is now empty.", "success");
    }
});

cancelSetPasswordButton.addEventListener('click', hideSetMasterPasswordForm);

showHintButton.addEventListener('click', async () => {
    const vaultDocRef = getUserVaultDocRef();
    if (!vaultDocRef) return;
    try {
        const docSnap = await getDoc(vaultDocRef);
        const hint = docSnap.exists() ? docSnap.data().masterPasswordHint : null;
        if (hint) {
            alert(`Your password hint is: "${hint}"`);
        } else {
            alert("No password hint has been set.");
        }
    } catch (e) {
        console.error("Error fetching hint:", e);
        alert("Could not retrieve hint.");
    }
});

forgotPasswordLink.addEventListener('click', showForgotPasswordScreen);
submitRecoveryCodeButton.addEventListener('click', resetMasterPasswordWithCode);
cancelResetButton.addEventListener('click', hideForgotPasswordScreen);

lockVaultButton.addEventListener('click', lockVault);
addNewItemButton.addEventListener('click', () => showItemForm());
generateRecoveryCodeButton.addEventListener('click', generateRecoveryCode);
saveItemButton.addEventListener('click', saveItem);
cancelItemButton.addEventListener('click', hideItemForm);

vaultItemsList.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;

    const id = target.dataset.id;
    if (!id && !target.classList.contains('copy-button')) return;

    if (target.classList.contains('edit-button')) {
        const itemToEdit = vaultData.find(item => item.id === id);
        if (itemToEdit) {
            showItemForm(itemToEdit);
        }
    } else if (target.classList.contains('delete-button')) {
        deleteItem(id);
    } else if (target.classList.contains('view-button')) {
        toggleItemVisibility(id, target);
    } else if (target.classList.contains('copy-button')) {
        const valueToCopy = target.dataset.value;
        if (valueToCopy) {
            copyToClipboard(valueToCopy);
        }
    }
});

// --- Initial Load Check ---
// This function now waits for Firebase authentication to be ready
async function initializeUI() {
    if (!isAuthReady) {
        // If auth is not ready, wait for onAuthStateChanged to call this again
        return;
    }

    const vaultDocRef = getUserVaultDocRef();
    if (!vaultDocRef) {
        // This shouldn't happen if isAuthReady is true, but as a safeguard
        showMessage(unlockMessage, "Error: User not authenticated for database access.", "error");
        return;
    }

    try {
        const docSnap = await getDoc(vaultDocRef);
        const vaultExists = docSnap.exists() && docSnap.data().salt;
        const hintExists = docSnap.exists() && docSnap.data().masterPasswordHint;

        if (vaultExists) {
            unlockScreen.style.display = 'block';
            vaultScreen.style.display = 'none';
            setMasterPasswordButton.textContent = 'Change Master Password';
            setMasterPasswordButton.classList.add('gray');
            if (hintExists) {
                showHintButton.style.display = 'block';
            } else {
                showHintButton.style.display = 'none';
            }
            forgotPasswordLink.style.display = 'block'; // Show forgot password link if vault exists
        } else {
            // No vault, prompt to set master password
            unlockScreen.style.display = 'none';
            setMasterPasswordForm.style.display = 'block';
            setPasswordTitle.textContent = 'Welcome to GuardianKey!';
            setPasswordIntro.textContent = 'Please set your master password to secure your data. This is your first setup.';
            unlockVaultButton.style.display = 'none';
            setMasterPasswordButton.style.display = 'none';
            showHintButton.style.display = 'none';
            forgotPasswordLink.style.display = 'none'; // Hide until vault exists
        }
    } catch (error) {
        console.error("Error initializing UI from Firestore:", error);
        showMessage(unlockMessage, "Failed to load vault status from database.", "error");
        unlockScreen.style.display = 'block'; // Keep unlock screen visible on error
    }
}

// Start Firebase initialization when the DOM is ready
window.onload = initializeFirebase;