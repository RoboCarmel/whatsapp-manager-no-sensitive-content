document.addEventListener("DOMContentLoaded", async () => {
    const backendUrl = "https://whats2managers.org"; // ✅ Change if hosted online
    const qrStatus = localStorage.setItem("qr_status", "pending");

    // ✅ Retrieve user ID safely
    const storedUser = localStorage.getItem("userId");
    let userId = null;

    if (storedUser) {
        try {
            userId = JSON.parse(storedUser)?.uid || null;
        } catch (error) {
            console.error("❌ Error parsing userId:", error);
        }
    }

    if (!userId) {
        console.error("❌ No user ID found. Redirecting to login...");
        window.location.href = "/auth.html";
    }

    const qrContainer = document.getElementById("qr-container");

    console.log("User ID:", userId);


    // ✅ Fetch QR Code initially
    async function fetchQRCode() {
        try {
            const response = await fetch(`${backendUrl}/qr/${userId}`);
            const data = await response.json();
    
            console.log("QR Response:", data);
            console.log("QR Response:", data.status);

    
            if (data.qr) {
                qrContainer.innerHTML = "";
                new QRCode(qrContainer, data.qr);
                localStorage.setItem("qr_status", "available"); // ✅ Store flag in local storage
            } else if(data.status === "connected") {
                qrContainer.innerText = "WhatsApp Web is already connected. Moving to home page...";
                localStorage.setItem("qr_status", "connected"); // ✅ Store flag as connected
            }
            else{
                localStorage.setItem("qr_status", "pending"); 
            }
        } catch (error) {
            console.error("Error fetching QR Code:", error);
            qrContainer.innerText = "Error connecting to server.";
            localStorage.setItem("qr_status", "error"); // ✅ Store flag as error
        }
    }
    

async function checkQrStatus() {
    const qrStatus = localStorage.getItem("qr_status");

    if (qrStatus === "connected") {
        console.log("✅ WhatsApp is already connected. Redirecting...");
        setTimeout(() => {
            window.location.href = "/select_chats.html";
        }, 5000); // ✅ Delay for 1 seconds before redirecting
    } else if (qrStatus === "available") {
        console.log("📷 QR Code is available. Waiting for scan...");
    } else {
        console.log("⏳ QR Code is not available yet. Retrying...");
        fetchQRCode(); // ✅ Retry fetching QR code
    }
}
localStorage.setItem("qr_status", "");
let attempts = 0;
const maxAttempts = 110;

checkQrStatus(); // Initial call

const qrInterval = setInterval(() => {
  if (attempts >= maxAttempts) {
    console.warn("❌ QR check max attempts reached. Stopping...");
    clearInterval(qrInterval);
    return;
  }

  checkQrStatus();
  attempts++;
}, 5000); // every 5 seconds

});
