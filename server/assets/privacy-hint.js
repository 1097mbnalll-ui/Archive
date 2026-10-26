// يغيّر التوضيح تحت خانة "مين يشوفها؟" حسب الاختيار.
(function () {
  const TEXT = {
    family: 'أصحاب الحسابات الخاصة بس. اللي يدخلون بكلمة سر الزوار ما يشوفونها.',
    public: 'كل من يدخل الموقع، بكلمة سر الزوار أو بحسابه.'
  };
  document.addEventListener('change', (event) => {
    const select = event.target.closest && event.target.closest('select.privacy-select');
    if (!select) return;
    const hint = select.parentElement.querySelector('.hint');
    if (hint) hint.textContent = TEXT[select.value] || '';
  });
})();
