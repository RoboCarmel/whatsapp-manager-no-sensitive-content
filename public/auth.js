import { auth, registerUser,isPhoneAllowed, loginUser, logoutUser } from "./firebase_tools.js";

document.getElementById("login-btn").addEventListener("click", async () => {
    document.getElementById('loadingOverlay').style.display = 'block';
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const allowed = await isPhoneAllowed(email);
    if (!allowed) {
        alert("❌ This email is not authorized to login.");
        document.getElementById('loadingOverlay').style.display = 'none';
        return;
    }

    try {
        const userCredential = await loginUser(email, password);
        document.getElementById("auth-status").innerText = `✅ Logged in as ${userCredential.user.email}`;
        localStorage.setItem("userId", JSON.stringify(userCredential.user));
        document.getElementById('loadingOverlay').style.display = 'none';
        window.location.href = "/home_tab.html"; // Redirect to home
    } catch (error) {
        document.getElementById('loadingOverlay').style.display = 'none';
        alert(`❌ Login failed: ${error.message}`);
    }
});

document.getElementById("register-btn").addEventListener("click", async () => {
    document.getElementById('loadingOverlay').style.display = 'block';
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const allowed = await isPhoneAllowed(email);
    if (!allowed) {
        alert("❌ This email is not authorized to login.");
        document.getElementById('loadingOverlay').style.display = 'none';
        return;
    }

    try {
        const userCredential = await registerUser(email, password);
        document.getElementById("auth-status").innerText = `✅ Registered as ${userCredential.user.email}`;
        localStorage.setItem("userId", JSON.stringify(userCredential.user));
        document.getElementById('loadingOverlay').style.display = 'none';
        window.location.href = "/home_tab.html"; // Redirect to home
    } catch (error) {
        document.getElementById('loadingOverlay').style.display = 'none';
        alert(`❌ Registration failed: ${error.message}`);
    }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
    try {
        await logoutUser();
        document.getElementById("auth-status").innerText = "Logged out!";
        localStorage.removeItem("userId");
        window.location.href = "/";
    } catch (error) {
        alert(`❌ Logout failed: ${error.message}`);
    }
});

// ✅ Auto-Redirect Logged-In Users
auth.onAuthStateChanged(user => {
    if (user) {
        document.getElementById("auth-status").innerText = `✅ Logged in as ${user.email}`;
        localStorage.setItem("userId", JSON.stringify(user));
        document.getElementById("logout-btn").style.display = "block";
    } else {
        document.getElementById("auth-status").innerText = "Not logged in.";
        localStorage.removeItem("userId");
        document.getElementById("logout-btn").style.display = "none";
    }
});

// import { auth, setupRecaptcha, isPhoneAllowed, sendVerificationCode } from "./firebase_tools.js";

// let confirmationResult = null;

// document.addEventListener("DOMContentLoaded", () => {
//     const recaptchaContainer = document.getElementById("recaptcha-container");
//     console.log(recaptchaContainer);
//     setupRecaptcha("recaptcha-container");
//   });

// document.getElementById("login-btn").addEventListener("click", async () => {
//   const phone = document.getElementById("phone").value;

//   if (!phone.startsWith("+")) {
//     alert("❌ Phone number must include country code, like +972...");
//     return;
//   }

//   const allowed = await isPhoneAllowed(phone);
//   if (!allowed) {
//     alert("❌ This phone number is not authorized to login.");
//     return;
//   }


//   try {
//     const widgetId = await window.recaptchaVerifier.render();
//     grecaptcha.reset(widgetId);

//     // ✅ Send SMS
//     confirmationResult = await sendVerificationCode(phone);
//     alert("📲 SMS sent! Enter the verification code:");
//     document.getElementById("code-section").style.display = "block";
//   } catch (err) {
//     alert(`❌ Failed to send SMS: ${err.message}`);
//   }
// });

// document.getElementById("verify-code-btn").addEventListener("click", async () => {
//   const code = document.getElementById("verification-code").value;

//   try {
//     const userCredential = await confirmationResult.confirm(code);
//     const user = userCredential.user;
//     localStorage.setItem("userId", JSON.stringify(user));
//     alert("✅ Login successful!");
//     window.location.href = "/home_tab.html";
//   } catch (err) {
//     alert(`❌ Code verification failed: ${err.message}`);
//   }
// });

