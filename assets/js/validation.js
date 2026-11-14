// Перевіряє email за структурою локальна-частина@домен.зона.
const REGEX_EMAIL = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Перевіряє суворий український формат +380 і рівно дев'ять цифр.
const REGEX_PHONE = /^\+380\d{9}$/;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("feedback-form");
  const successModal = document.getElementById("successModal");
  const successDialog = successModal?.querySelector('[role="dialog"]');
  const closeModalBtn = document.getElementById("closeModalBtn");
  const phoneHint = document.getElementById("phoneHint");
  const phoneHintText = document.getElementById("phoneHintText");
  const phoneFixButton = document.getElementById("phoneFixButton");
  const submitButton = form?.querySelector('button[type="submit"]');
  const touchedFields = new Set();
  let suggestedPhoneValue = null;
  let lastFocusedElement = null;
  let backgroundState = [];
  let isSubmitting = false;

  if (!(form instanceof HTMLFormElement)) {
    throw new Error('Форму зворотного зв’язку "#feedback-form" не знайдено.');
  }
  if (!(successModal instanceof HTMLDivElement)) {
    throw new Error('Модальне вікно "#successModal" не знайдено.');
  }
  if (!(successDialog instanceof HTMLDivElement)) {
    throw new Error('Діалог у "#successModal" не знайдено.');
  }
  if (!(closeModalBtn instanceof HTMLButtonElement)) {
    throw new Error('Кнопку закриття "#closeModalBtn" не знайдено.');
  }
  if (!(phoneHint instanceof HTMLParagraphElement)) {
    throw new Error('Підказку "#phoneHint" не знайдено.');
  }
  if (!(phoneHintText instanceof HTMLSpanElement)) {
    throw new Error('Текст підказки "#phoneHintText" не знайдено.');
  }
  if (!(phoneFixButton instanceof HTMLButtonElement)) {
    throw new Error('Кнопку виправлення телефону "#phoneFixButton" не знайдено.');
  }
  if (!(submitButton instanceof HTMLButtonElement)) {
    throw new Error("Не знайдено кнопку надсилання форми.");
  }

  const nameInput = getInput("name");
  const emailInput = getInput("email");
  const phoneInput = getInput("phone");
  const messageInput = getInput("message");
  const agreementInput = getInput("consent");
  const formFields = [
    nameInput,
    emailInput,
    phoneInput,
    messageInput,
    agreementInput,
  ];
  const backgroundElements = [
    document.querySelector("header"),
    document.querySelector("main"),
    document.querySelector("footer"),
  ].filter((element) => element instanceof HTMLElement);

  // Повертає input або textarea за id та явно сигналізує про помилку розмітки.
  function getInput(id) {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      throw new Error(`Поле з id="${id}" не знайдено.`);
    }
    return element;
  }

  // Повертає зв'язаний з полем абзац помилки.
  function getErrorElement(id) {
    const element = document.getElementById(`${id}Error`);
    if (!(element instanceof HTMLParagraphElement)) {
      throw new Error(`Повідомлення про помилку для поля "${id}" не знайдено.`);
    }
    return element;
  }

  // Знаходить іконки станів у найближчій обгортці поля.
  function getStatusIcons(inputElement) {
    const wrapper = inputElement.closest(".relative");
    const icons = Array.from(wrapper?.querySelectorAll("svg") ?? []);
    const errorIcon = icons.find((icon) =>
      icon.classList.contains("peer-aria-[invalid=true]:block"),
    );
    const successIcon = icons.find((icon) =>
      icon.classList.contains("peer-data-[valid=true]:block"),
    );
    if (!errorIcon || !successIcon) {
      throw new Error(`Не знайдено іконки станів поля "${inputElement.id}".`);
    }
    return { errorIcon, successIcon };
  }

  // Показує помилку, червону рамку та іконку попередження.
  function showErr(inputElement, errorElement, message) {
    const { errorIcon, successIcon } = getStatusIcons(inputElement);
    inputElement.setAttribute("aria-invalid", "true");
    inputElement.removeAttribute("data-valid");
    errorElement.textContent = message;
    errorElement.classList.remove("hidden");
    errorIcon.classList.remove("hidden");
    successIcon.classList.add("hidden");
  }

  // Показує успішну перевірку, зелену рамку та іконку галочки.
  function showSuccess(inputElement, errorElement) {
    const { errorIcon, successIcon } = getStatusIcons(inputElement);
    inputElement.setAttribute("data-valid", "true");
    inputElement.setAttribute("aria-invalid", "false");
    errorElement.classList.add("hidden");
    errorElement.textContent = "";
    errorIcon.classList.add("hidden");
    successIcon.classList.remove("hidden");
  }

  // Повертає поле, помилку та іконки до нейтрального стану.
  function clearError(inputElement, errorElement) {
    const { errorIcon, successIcon } = getStatusIcons(inputElement);
    inputElement.setAttribute("aria-invalid", "false");
    inputElement.removeAttribute("data-valid");
    errorElement.classList.add("hidden");
    errorElement.textContent = "";
    errorIcon.classList.add("hidden");
    successIcon.classList.add("hidden");
    if (inputElement === phoneInput) {
      hidePhoneHint();
    }
  }

  // Приховує підказку й очищає збережену пропозицію для телефону.
  function hidePhoneHint() {
    suggestedPhoneValue = null;
    phoneHint.classList.add("hidden");
    phoneHintText.textContent = "";
    updateDescribedBy(phoneInput, "phoneHint", false);
  }

  // Додає або прибирає id підказки, не змінюючи інші aria-describedby зв'язки.
  function updateDescribedBy(inputElement, descriptionId, include) {
    const ids = new Set(
      (inputElement.getAttribute("aria-describedby") ?? "")
        .split(/\s+/)
        .filter(Boolean),
    );
    if (include) {
      ids.add(descriptionId);
    } else {
      ids.delete(descriptionId);
    }
    inputElement.setAttribute("aria-describedby", Array.from(ids).join(" "));
  }

  // Генерує можливий український формат, не змінюючи початкове значення поля.
  function suggestPhoneFix(value) {
    const cleanedValue = value.replace(/[\s()-]/g, "");

    // Початковий 0 приймається лише разом із дев'ятьма цифрами номера.
    if (/^0\d{9}$/.test(cleanedValue)) {
      return `+38${cleanedValue}`;
    }
    // Префікс 380 приймається лише разом із дев'ятьма цифрами номера.
    if (/^380\d{9}$/.test(cleanedValue)) {
      return `+${cleanedValue}`;
    }
    // Уже повний номер можна запропонувати без жодних змін.
    if (/^\+380\d{9}$/.test(cleanedValue)) {
      return cleanedValue;
    }
    // Часткові, завеликі значення, літери й порожній рядок не виправляються автоматично.
    return null;
  }

  // Перевіряє ім'я після trim у межах від 2 до 50 символів.
  function validateName() {
    const inputElement = nameInput;
    const errorElement = getErrorElement("name");
    const value = inputElement.value.trim();
    const valid = value.length >= 2 && value.length <= 50;
    if (valid) {
      showSuccess(inputElement, errorElement);
    } else {
      showErr(inputElement, errorElement, "Ім'я повинно містити не менше 2 символів.");
    }
    return valid;
  }

  // Перевіряє непорожній email, формат адреси та межу у 254 символи.
  function validateEmail() {
    const inputElement = emailInput;
    const errorElement = getErrorElement("email");
    const value = inputElement.value.trim();
    const valid = value.length > 0 && value.length <= 254 && REGEX_EMAIL.test(value);
    if (valid) {
      showSuccess(inputElement, errorElement);
    } else {
      showErr(
        inputElement,
        errorElement,
        "Введіть коректну електронну адресу (наприклад: user@mail.com).",
      );
    }
    return valid;
  }

  // Перевіряє телефон суворим regex без нормалізації введеного значення.
  function validatePhone() {
    const inputElement = phoneInput;
    const errorElement = getErrorElement("phone");
    const value = inputElement.value.trim();

    // Порожній обов'язковий телефон має окреме повідомлення й не отримує підказки.
    if (!value) {
      showErr(inputElement, errorElement, "Введіть номер телефону.");
      hidePhoneHint();
      return false;
    }

    if (REGEX_PHONE.test(value)) {
      showSuccess(inputElement, errorElement);
      hidePhoneHint();
      return true;
    }

    showErr(
      inputElement,
      errorElement,
      "Формат має бути строго українським: +380XXXXXXXXX.",
    );

    // Підказка нормалізує лише потенційну пропозицію; помилка лишається видимою до згоди.
    suggestedPhoneValue = suggestPhoneFix(value);
    if (suggestedPhoneValue) {
      phoneHintText.textContent = `Можливо, ви мали на увазі ${suggestedPhoneValue}?`;
      phoneHint.classList.remove("hidden");
      updateDescribedBy(phoneInput, "phoneHint", true);
    } else {
      hidePhoneHint();
    }
    return false;
  }

  // Перевіряє повідомлення після trim у межах від 10 до 1000 символів.
  function validateMessage() {
    const inputElement = messageInput;
    const errorElement = getErrorElement("message");
    const value = inputElement.value.trim();
    const valid = value.length >= 10 && value.length <= 1000;
    if (valid) {
      showSuccess(inputElement, errorElement);
    } else {
      showErr(
        inputElement,
        errorElement,
        "Повідомлення має містити щонайменше 10 символів.",
      );
    }
    return valid;
  }

  // Перевіряє, чи користувач надав обов'язкову згоду.
  function validateAgreement() {
    const inputElement = agreementInput;
    const errorElement = getErrorElement("consent");
    if (inputElement.checked) {
      showSuccess(inputElement, errorElement);
      return true;
    }
    showErr(
      inputElement,
      errorElement,
      "Підтвердьте згоду, щоб надіслати повідомлення.",
    );
    return false;
  }

  // Перевіряє конкретне поле, не показуючи стан до першої взаємодії.
  function validateTouchedField(inputElement) {
    if (inputElement === nameInput) return validateName();
    if (inputElement === emailInput) return validateEmail();
    if (inputElement === phoneInput) return validatePhone();
    if (inputElement === messageInput) return validateMessage();
    return validateAgreement();
  }

  // Тести вручну: початково/при помилках модалка прихована; відкрита лише після валідної форми.
  // Перевірити Escape, кнопку та фон; повернення фокусу; Tab-пастку; блокування прокрутки.
  // ІМІТАЦІЯ надсилання: дані нікуди не передаються, бекенд не підключено
  function simulateSubmit() {
    if (isSubmitting) return;
    isSubmitting = true;
    lastFocusedElement = submitButton;
    submitButton.disabled = true;
    submitButton.textContent = "Надсилаємо…";

    window.setTimeout(() => {
      openModal();
      form.reset();
      touchedFields.clear();
      for (const inputElement of formFields) {
        clearError(inputElement, getErrorElement(inputElement.id));
      }
      submitButton.disabled = false;
      submitButton.textContent = "Надіслати";
      isSubmitting = false;
    }, 600);
  }

  // Робить фон недоступним для клавіатури й допоміжних технологій.
  function disableBackground() {
    backgroundState = backgroundElements.map((element) => ({
      element,
      wasInert: element.hasAttribute("inert"),
      ariaHidden: element.getAttribute("aria-hidden"),
    }));
    for (const { element } of backgroundState) {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    }
    document.body.classList.add("overflow-hidden");
  }

  // Відновлює попередній стан фонового вмісту та прокрутки.
  function enableBackground() {
    for (const { element, wasInert, ariaHidden } of backgroundState) {
      if (!wasInert) {
        element.removeAttribute("inert");
      }
      if (ariaHidden === null) {
        element.removeAttribute("aria-hidden");
      } else {
        element.setAttribute("aria-hidden", ariaHidden);
      }
    }
    backgroundState = [];
    document.body.classList.remove("overflow-hidden");
  }

  // Утримує клавіатурний фокус усередині кнопки діалогу.
  function trapModalFocus(event) {
    if (event.key === "Escape") {
      closeModal();
      return;
    }
    if (event.key !== "Tab") return;

    const focusableElements = Array.from(
      successDialog.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element instanceof HTMLElement);
    if (focusableElements.length === 0) {
      event.preventDefault();
      successDialog.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (focusableElements.length === 1) {
      event.preventDefault();
      firstElement.focus();
    } else if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  // Відкриває модалку, блокує фон і ставить фокус на кнопку закриття.
  function openModal() {
    disableBackground();
    successModal.classList.remove("hidden");
    successModal.classList.add("flex");
    document.addEventListener("keydown", trapModalFocus);
    closeModalBtn.focus();
  }

  // Закриває модалку та повертає фокус до елемента, який її відкрив.
  function closeModal() {
    document.removeEventListener("keydown", trapModalFocus);
    successModal.classList.remove("flex");
    successModal.classList.add("hidden");
    enableBackground();
    if (lastFocusedElement instanceof HTMLElement) {
      lastFocusedElement.focus();
    }
    lastFocusedElement = null;
  }

  // Передає можливе виправлення телефону лише після натискання кнопки.
  phoneFixButton.addEventListener("click", () => {
    if (!suggestedPhoneValue) return;
    phoneInput.value = suggestedPhoneValue;
    touchedFields.add(phoneInput);
    validatePhone();
  });

  // Показує помилку або успіх лише після blur чи першої перевірки поля.
  for (const inputElement of [nameInput, emailInput, phoneInput, messageInput]) {
    inputElement.addEventListener("input", () => {
      if (touchedFields.has(inputElement)) {
        validateTouchedField(inputElement);
      }
    });
  }

  // Після виходу з будь-якого поля позначає його як touched і перевіряє.
  for (const inputElement of [
    nameInput,
    emailInput,
    phoneInput,
    messageInput,
    agreementInput,
  ]) {
    inputElement.addEventListener("blur", () => {
      touchedFields.add(inputElement);
      validateTouchedField(inputElement);
    });
  }

  // Перевіряє чекбокс одразу після зміни його стану.
  agreementInput.addEventListener("change", () => {
    touchedFields.add(agreementInput);
    validateAgreement();
  });

  // Перевіряє всі поля й повертає перше невалідне для керування фокусом.
  function validateForm() {
    const results = [
      validateName(),
      validateEmail(),
      validatePhone(),
      validateMessage(),
      validateAgreement(),
    ];
    const firstInvalidField = formFields.find(
      (inputElement, index) => !results[index],
    );
    return { valid: results.every(Boolean), firstInvalidField };
  }

  // Скасовує відправку, показує помилки або запускає імітацію успіху.
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    for (const inputElement of formFields) {
      touchedFields.add(inputElement);
    }
    const result = validateForm();
    if (!result.valid && result.firstInvalidField) {
      result.firstInvalidField.focus();
      return;
    }

    simulateSubmit();
  });

  // Закриває модалку кнопкою або кліком поза діалогом.
  closeModalBtn.addEventListener("click", closeModal);
  successModal.addEventListener("click", (event) => {
    if (event.target === successModal) {
      closeModal();
    }
  });
});
