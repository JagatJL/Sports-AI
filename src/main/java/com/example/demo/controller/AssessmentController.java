package com.example.demo.controller;

import com.example.demo.config.MlService;
import com.example.demo.model.Assessment;
import com.example.demo.model.Student;
import com.example.demo.model.User;
import com.example.demo.repository.AssessmentRepository;
import com.example.demo.repository.StudentRepository;
import com.example.demo.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/students/{studentId}/assessments")
public class AssessmentController {

    private final StudentRepository studentRepository;
    private final AssessmentRepository assessmentRepository;
    private final UserRepository userRepository;
    private final MlService mlService;

    @Value("${app.upload.dir:./uploads}")
    private String uploadDir;

    public AssessmentController(StudentRepository studentRepository, AssessmentRepository assessmentRepository,
                                UserRepository userRepository, MlService mlService) {
        this.studentRepository = studentRepository;
        this.assessmentRepository = assessmentRepository;
        this.userRepository = userRepository;
        this.mlService = mlService;
    }

    // Get all assessments for a student
    @GetMapping
    public ResponseEntity<?> getAssessments(@PathVariable Long studentId, @RequestParam Long userId) {
        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found"));
        Optional<Student> studentOpt = studentRepository.findById(studentId);
        if (studentOpt.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Student not found"));
        Student student = studentOpt.get();
        User user = userOpt.get();
        if (user.getRole() == User.Role.COACH && !student.getCoach().getId().equals(userId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "You do not own this student profile"));
        }
        return ResponseEntity.ok(assessmentRepository.findByStudentId(studentId));
    }

    // Upload video → ML model analyzes → returns score, qualified, feedback
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> createAssessment(
            @PathVariable Long studentId,
            @RequestParam Long userId,
            @RequestParam MultipartFile video,
            @RequestParam String exerciseType) {
        try {
            Optional<User> userOpt = userRepository.findById(userId);
            if (userOpt.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found"));
            User user = userOpt.get();
            if (user.getRole() != User.Role.COACH) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only coaches can upload assessments"));
            }
            Optional<Student> studentOpt = studentRepository.findById(studentId);
            if (studentOpt.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Student not found"));
            Student student = studentOpt.get();
            if (!student.getCoach().getId().equals(userId)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "You do not own this student profile"));
            }
            if (video.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "Video file is required"));

            // Save video to disk
            Path savedVideoPath;
            String relativeVideoPath;
            Path dir = Paths.get(uploadDir, "videos").toAbsolutePath().normalize();
            Files.createDirectories(dir);
            String original = video.getOriginalFilename();
            String ext = (original != null && original.contains(".")) ? original.substring(original.lastIndexOf(".")) : ".webm";
            String fileName = UUID.randomUUID() + ext;
            savedVideoPath = dir.resolve(fileName);
            Files.copy(video.getInputStream(), savedVideoPath);
            relativeVideoPath = "uploads/videos/" + fileName;

            // Send to ML model for analysis
            MlService.MlResult mlResult = mlService.analyze(savedVideoPath, exerciseType);

            Assessment assessment = new Assessment();
            assessment.setStudent(student);
            assessment.setVideoPath(relativeVideoPath);
            assessment.setExerciseType(exerciseType);
            assessment.setScore(mlResult.score());
            assessment.setQualified(mlResult.qualified());
            assessment.setAiFeedback(mlResult.feedback());

            return ResponseEntity.ok(assessmentRepository.save(assessment));
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getClass().getName(), "message", e.getMessage() != null ? e.getMessage() : "null"));
        }
    }

    // Submit qualified assessment to SAI — only allowed if ML marked it as qualified
    @PostMapping("/{assessmentId}/submit-to-sai")
    public ResponseEntity<?> submitToSai(
            @PathVariable Long studentId,
            @PathVariable Long assessmentId,
            @RequestParam Long userId) {

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found"));
        if (userOpt.get().getRole() != User.Role.COACH) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only coaches can submit to SAI"));
        }
        Optional<Assessment> assessmentOpt = assessmentRepository.findById(assessmentId);
        if (assessmentOpt.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Assessment not found"));

        Assessment assessment = assessmentOpt.get();

        if (!assessment.getStudent().getId().equals(studentId)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "Assessment does not belong to this student"));
        }
        if (!assessment.getStudent().getCoach().getId().equals(userId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "You do not own this student profile"));
        }
        if (!assessment.isQualified()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Cannot submit to SAI: student did not qualify in AI evaluation"));
        }
        if (assessment.isSubmittedToSai()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Already submitted to SAI"));
        }

        assessment.setSubmittedToSai(true);
        return ResponseEntity.ok(assessmentRepository.save(assessment));
    }
}
