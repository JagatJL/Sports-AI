package com.example.demo.controller;

import com.example.demo.model.Assessment;
import com.example.demo.model.VerifyRequest;
import com.example.demo.model.User;
import com.example.demo.repository.AssessmentRepository;
import com.example.demo.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/sai")
public class SaiController {

    private final AssessmentRepository assessmentRepository;
    private final UserRepository userRepository;

    public SaiController(AssessmentRepository assessmentRepository, UserRepository userRepository) {
        this.assessmentRepository = assessmentRepository;
        this.userRepository = userRepository;
    }

    // SAI admin sees all assessments submitted by coaches (only qualified ones can be submitted)
    @GetMapping("/submissions")
    public ResponseEntity<?> getSubmissions(@RequestParam Long userId) {
        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found"));
        if (userOpt.get().getRole() != User.Role.SAI_AUTHORITY) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only SAI authorities can access this dashboard"));
        }
        return ResponseEntity.ok(assessmentRepository.findBySubmittedToSaiTrueOrderByCreatedAtDesc());
    }

    // SAI admin approves or rejects a submission
    @PostMapping("/assessments/{id}/verify")
    public ResponseEntity<?> verifyAssessment(
            @PathVariable Long id,
            @RequestParam Long userId,
            @RequestBody VerifyRequest body) {

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found"));
        if (userOpt.get().getRole() != User.Role.SAI_AUTHORITY) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Only SAI authorities can verify assessments"));
        }
        String statusStr = body.getStatus();
        if (statusStr == null || (!statusStr.equals("APPROVED") && !statusStr.equals("REJECTED"))) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid status. Must be APPROVED or REJECTED."));
        }
        Optional<Assessment> assessmentOpt = assessmentRepository.findById(id);
        if (assessmentOpt.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Assessment not found"));
        Assessment assessment = assessmentOpt.get();
        if (!assessment.isSubmittedToSai()) {
            return ResponseEntity.badRequest().body(Map.of("error", "This assessment has not been submitted to SAI"));
        }
        assessment.setVerificationStatus(Assessment.VerificationStatus.valueOf(statusStr));
        return ResponseEntity.ok(assessmentRepository.save(assessment));
    }
}
