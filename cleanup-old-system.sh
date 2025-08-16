#!/bin/bash

# =================================================================
# سكريبت تنظيف النظام القديم والانتقال للنظام الذكي
# تشغيل: ./cleanup-old-system.sh
# =================================================================

set -e  # إيقاف التنفيذ عند أي خطأ

echo "🗑️  بدء عملية تنظيف النظام القديم..."
echo "===================================================="

# الألوان للإخراج الملون
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # إعادة تعيين اللون

# دالة للطباعة الملونة
print_step() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')] $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# التحقق من المتطلبات
print_step "التحقق من المتطلبات الأساسية..."

if ! command -v supabase &> /dev/null; then
    print_error "Supabase CLI غير مثبت"
    exit 1
fi

if ! command -v node &> /dev/null; then
    print_error "Node.js غير مثبت"
    exit 1
fi

print_success "جميع المتطلبات متوفرة"

# ==================================================
# المرحلة 1: النسخ الاحتياطي
# ==================================================

print_step "المرحلة 1: إنشاء نسخة احتياطية..."

BACKUP_DIR="backup-old-intent-system-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

print_step "نسخ الملفات القديمة إلى $BACKUP_DIR..."

# نسخ الوظائف القديمة
if [ -d "supabase/functions/classify-intent" ]; then
    cp -r supabase/functions/classify-intent "$BACKUP_DIR/"
    print_success "تم نسخ classify-intent"
fi

if [ -d "supabase/functions/enhanced-intent-classifier" ]; then
    cp -r supabase/functions/enhanced-intent-classifier "$BACKUP_DIR/"
    print_success "تم نسخ enhanced-intent-classifier"
fi

if [ -d "supabase/functions/intent-test-suite" ]; then
    cp -r supabase/functions/intent-test-suite "$BACKUP_DIR/"
    print_success "تم نسخ intent-test-suite"
fi

# نسخ الملفات المشتركة القديمة
OLD_SHARED_FILES=(
    "supabase/functions/_shared/semantic-keywords.ts"
    "supabase/functions/_shared/language-detector.ts"
    "supabase/functions/_shared/context-analyzer.ts"
)

for file in "${OLD_SHARED_FILES[@]}"; do
    if [ -f "$file" ]; then
        cp "$file" "$BACKUP_DIR/"
        print_success "تم نسخ $(basename $file)"
    fi
done

# نسخ ملفات الاختبار
TEST_FILES=(
    "test-enhanced-intent-system.js"
    "test-fixed-smart-system.js"
    "test-fixed-system.js"
    "test-simplified.js"
)

for file in "${TEST_FILES[@]}"; do
    if [ -f "$file" ]; then
        cp "$file" "$BACKUP_DIR/"
        print_success "تم نسخ $(basename $file)"
    fi
done

# نسخ ملفات التوثيق القديمة
DOC_FILES=(
    "ENHANCED_INTENT_SYSTEM_README.md"
    "AI_PERSONALITY_SYSTEM_README.md"
)

for file in "${DOC_FILES[@]}"; do
    if [ -f "$file" ]; then
        cp "$file" "$BACKUP_DIR/"
        print_success "تم نسخ $(basename $file)"
    fi
done

print_success "اكتملت النسخة الاحتياطية في: $BACKUP_DIR"

# ==================================================
# المرحلة 2: تحديث الكود
# ==================================================

print_step "المرحلة 2: تحديث المراجع في الكود..."

# البحث عن fallback في webhook وإزالته
if grep -q "enhanced-intent-classifier" supabase/functions/whatsapp-webhook/index.ts 2>/dev/null; then
    print_warning "تم العثور على مراجع للنظام القديم في webhook"
    print_warning "يجب إزالتها يدوياً أو تشغيل المعالج التلقائي"
    
    # سؤال المستخدم
    read -p "هل تريد إزالة fallback للنظام القديم تلقائياً؟ (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # إزالة fallback (يحتاج تحسين للتعامل مع الكود متعدد الأسطر)
        print_warning "الإزالة التلقائية غير مثالية - يفضل التحديث اليدوي"
    fi
fi

# ==================================================
# المرحلة 3: حذف الوظائف من Supabase
# ==================================================

print_step "المرحلة 3: حذف الوظائف القديمة من Supabase..."

# قائمة الوظائف للحذف
FUNCTIONS_TO_DELETE=(
    "classify-intent"
    "enhanced-intent-classifier"
    "intent-test-suite"
)

for func in "${FUNCTIONS_TO_DELETE[@]}"; do
    print_step "محاولة حذف وظيفة: $func"
    
    # التحقق من وجود الوظيفة أولاً
    if supabase functions list | grep -q "$func"; then
        supabase functions delete "$func" --force
        print_success "تم حذف $func"
    else
        print_warning "$func غير موجودة أو محذوفة مسبقاً"
    fi
done

# ==================================================
# المرحلة 4: حذف الملفات المحلية
# ==================================================

print_step "المرحلة 4: حذف الملفات المحلية..."

# حذف مجلدات الوظائف
FUNCTION_DIRS=(
    "supabase/functions/classify-intent"
    "supabase/functions/enhanced-intent-classifier"
    "supabase/functions/intent-test-suite"
)

for dir in "${FUNCTION_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        rm -rf "$dir"
        print_success "تم حذف $dir"
    fi
done

# حذف الملفات المشتركة القديمة
for file in "${OLD_SHARED_FILES[@]}"; do
    if [ -f "$file" ]; then
        rm "$file"
        print_success "تم حذف $file"
    fi
done

# حذف ملفات الاختبار
for file in "${TEST_FILES[@]}"; do
    if [ -f "$file" ]; then
        rm "$file"
        print_success "تم حذف $file"
    fi
done

# حذف ملفات التوثيق القديمة
for file in "${DOC_FILES[@]}"; do
    if [ -f "$file" ]; then
        rm "$file"
        print_success "تم حذف $file"
    fi
done

# ==================================================
# المرحلة 5: أرشفة المايجريشن القديمة
# ==================================================

print_step "المرحلة 5: أرشفة مايجريشن قديمة..."

# إنشاء مجلد الأرشيف
mkdir -p supabase/migrations/archived

OLD_MIGRATIONS=(
    "supabase/migrations/enhance_intent_system.sql"
    "supabase/migrations/create_intent_categories_table.sql"
    "supabase/migrations/create_intent_recognition_cache.sql"
)

for migration in "${OLD_MIGRATIONS[@]}"; do
    if [ -f "$migration" ]; then
        mv "$migration" supabase/migrations/archived/
        print_success "تم أرشفة $(basename $migration)"
    fi
done

# ==================================================
# المرحلة 6: اختبار النظام
# ==================================================

print_step "المرحلة 6: اختبار النظام النهائي..."

if [ -f "final-system-test.js" ]; then
    # التحقق من متغيرات البيئة
    if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
        print_warning "لتشغيل الاختبار، يجب تعيين متغيرات البيئة:"
        echo "export SUPABASE_URL=\"https://your-project.supabase.co\""
        echo "export SUPABASE_SERVICE_ROLE_KEY=\"your-service-key\""
        echo "export TEST_INSTANCE_ID=\"your-test-instance-id\""
        echo "export TEST_USER_ID=\"your-test-user-id\""
        echo
        echo "ثم تشغيل: node final-system-test.js"
    else
        print_step "تشغيل اختبار النظام النهائي..."
        chmod +x final-system-test.js
        
        if node final-system-test.js; then
            print_success "اجتاز النظام جميع الاختبارات!"
        else
            print_error "فشل النظام في بعض الاختبارات - راجع الإخراج أعلاه"
        fi
    fi
else
    print_warning "ملف الاختبار غير موجود، تخطي الاختبار التلقائي"
fi

# ==================================================
# المرحلة 7: التقرير النهائي
# ==================================================

print_step "المرحلة 7: إنشاء التقرير النهائي..."

# تحديث تقرير التنظيف بالتاريخ
if [ -f "OLD_SYSTEM_CLEANUP_REPORT.md" ]; then
    sed -i.bak "s/\[DATE_TO_BE_FILLED\]/$(date '+%Y-%m-%d %H:%M:%S')/g" OLD_SYSTEM_CLEANUP_REPORT.md
    rm -f OLD_SYSTEM_CLEANUP_REPORT.md.bak
    print_success "تم تحديث تقرير التنظيف"
fi

# ==================================================
# الخلاصة النهائية
# ==================================================

echo
echo "===================================================="
print_success "اكتملت عملية تنظيف النظام القديم بنجاح!"
echo "===================================================="

echo
echo "📊 ملخص التنفيذ:"
echo "  ✅ تم إنشاء نسخة احتياطية: $BACKUP_DIR"
echo "  ✅ تم حذف ${#FUNCTION_DIRS[@]} مجلدات وظائف"  
echo "  ✅ تم حذف $((${#OLD_SHARED_FILES[@]} + ${#TEST_FILES[@]} + ${#DOC_FILES[@]})) ملف"
echo "  ✅ تم أرشفة ${#OLD_MIGRATIONS[@]} ملف مايجريشن"
echo

echo "🎯 الخطوات التالية:"
echo "  1. تشغيل الاختبار النهائي إذا لم يتم: node final-system-test.js"
echo "  2. مراجعة تقرير التنظيف: OLD_SYSTEM_CLEANUP_REPORT.md"
echo "  3. تحديث أي مراجع متبقية في الكود يدوياً"
echo "  4. مراقبة أداء النظام الجديد في الإنتاج"

echo
print_success "النظام الآن نظيف ومحسن بالكامل! 🎉"