const copyButtons = document.querySelectorAll("[data-copy]");
const toast = document.querySelector(".toast");
let toastTimer;

async function copyText(value) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 1800);
}

copyButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const label = button.querySelector(".copy-label");

    try {
      await copyText(button.dataset.copy);
      button.classList.add("copied");
      label.textContent = "已复制";
      showToast(`已复制 ${button.dataset.copy}`);

      window.setTimeout(() => {
        button.classList.remove("copied");
        label.textContent = "复制";
      }, 1600);
    } catch {
      showToast("复制失败，请长按号码复制");
    }
  });
});
