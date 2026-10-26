// يغيّر التوضيح تحت خانة "مين يشوفها؟" حسب الاختيار.
(function () {
  const TEXT = {
    family: 'أفراد العائلة بس، بعد ما يدخلون بحساباتهم.',
    public: 'أي أحد يفتح الموقع يشوفها، حتى بدون دخول.'
  };
  document.addEventListener('change', (event) => {
    const select = event.target.closest && event.target.closest('select.privacy-select');
    if (!select) return;
    const hint = select.parentElement.querySelector('.hint');
    if (hint) hint.textContent = TEXT[select.value] || '';
  });
})();
