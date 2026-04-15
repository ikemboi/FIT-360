document.addEventListener("DOMContentLoaded", () => {
    // Form Elements
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const tabBtns = document.querySelectorAll(".tab-btn");
    const switchBtns = document.querySelectorAll(".switch-btn");

    // Form Switching Logic
    function switchForm(formType) {
        const isLogin = formType === "login";

        tabBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.form === formType));
        loginForm.classList.toggle("active", isLogin);
        signupForm.classList.toggle("active", !isLogin);

        loginForm.reset();
        signupForm.reset();
        clearErrors();
    }

    tabBtns.forEach((btn) => btn.addEventListener("click", () => switchForm(btn.dataset.form)));
    switchBtns.forEach((btn) => btn.addEventListener("click", () => switchForm(btn.dataset.switch)));

    function validateEmail(email) {
        return /\S+@\S+\.\S+/.test(email);
    }

    function validatePassword(password) {
        return password.length >= 6;
    }

    function showError(input, message) {
        const inputGroup = input.parentElement;
        const errorElement = inputGroup.querySelector(".error-message");
        inputGroup.classList.add("error");
        errorElement.textContent = message;
    }

    function clearError(input) {
        const inputGroup = input.parentElement;
        const errorElement = inputGroup.querySelector(".error-message");
        inputGroup.classList.remove("error");
        errorElement.textContent = "";
    }

    function clearErrors() {
        document.querySelectorAll(".error-message").forEach((error) => (error.textContent = ""));
        document.querySelectorAll(".input-group").forEach((group) => group.classList.remove("error"));
    }

    document.querySelectorAll("input").forEach((input) => {
        input.addEventListener("input", () => clearError(input));
    });

    // LOGIN FORM SUBMISSION
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = loginForm.email.value;
        const password = loginForm.password.value;

        try {
            const response = await fetch("https://dennismagaki.github.io/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();
            console.log("DEBUG: Response Data:", data); // Debugging Log

            if (response.ok && data.token) {
                localStorage.setItem("token", data.token);
                console.log("DEBUG: Token Stored:", localStorage.getItem("token")); // Debugging Log

                // Redirect to dashboard
                window.location.href = "dashboard.html";
            } else {
                alert(data.error || "Login failed");
            }
        } catch (error) {
            console.error("Error:", error);
            alert("An error occurred. Please try again.");
        }
    });

    // SIGNUP FORM SUBMISSION
    signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        let isValid = true;

        const fullName = signupForm.fullName.value;
        const email = signupForm.email.value;
        const password = signupForm.password.value;
        const role = signupForm.role.value;

        if (!fullName.trim()) {
            showError(signupForm.fullName, "Full name is required");
            isValid = false;
        }

        if (!validateEmail(email)) {
            showError(signupForm.email, "Please enter a valid email address");
            isValid = false;
        }

        if (!validatePassword(password)) {
            showError(signupForm.password, "Password must be at least 6 characters");
            isValid = false;
        }

        if (isValid) {
            try {
                // Step 1: Sign up the user
                const signupResponse = await fetch("http://127.0.0.1:5000/auth/signup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ fullName, email, password, role }),
                });

                const signupData = await signupResponse.json();

                if (!signupResponse.ok) {
                    alert(signupData.error || "Signup failed");
                    return;
                }

                // Step 2: Automatically log the user in after successful signup
                const loginResponse = await fetch("http://127.0.0.1:5000/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password }),
                });

                const loginData = await loginResponse.json();

                if (loginResponse.ok && loginData.token) {
                    // Store the token in localStorage
                    localStorage.setItem("token", loginData.token);

                    // Redirect to the dashboard
                    window.location.href = "dashboard.html";
                } else {
                    alert("Automatic login failed. Please log in manually.");
                }
            } catch (error) {
                console.error("Error:", error);
                alert("An error occurred. Please try again.");
            }
        }
    });
});

